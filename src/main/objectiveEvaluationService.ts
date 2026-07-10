import Anthropic from '@anthropic-ai/sdk'
import { BrowserWindow } from 'electron'
import type { TranscriptLine } from '../renderer/src/types/audio'
import type { Interview, ObjectiveResult } from '../renderer/src/types/domain'
import type { ObjectiveEvaluationEvent } from '../renderer/src/types/llm'
import { getAnthropicKey, mapSdkError, toLlmError, LlmOperationError } from './llmService'
import { extractUsage, recordInterviewUsage, roundUpUsd } from './aiCost'
import { readTranscriptLines } from './noteService'
import * as repository from './db/repository'

/**
 * Evaluación post-grabación del cumplimiento de objetivos (SPEC-025). Vive
 * SOLO en main (patrón llmService/noteService): el SDK de Anthropic y la clave
 * jamás llegan al renderer; por IPC solo viajan el interviewId, la Interview
 * actualizada y eventos tipados.
 *
 * Invariantes:
 * - Degradable: el camino automático (tras `recording:stop`) es fire-and-forget
 *   y ningún fallo suyo afecta al guardado de la grabación.
 * - La evaluación se persiste SOLO tras un parseo válido Y alineado en longitud
 *   con los objetivos: un resultado desalineado se trata como fallo de formato.
 * - La evaluación final prevalece sobre el seguimiento en vivo: los índices
 *   cubiertos por el asistente viajan como pista explícitamente no vinculante.
 */

// Constantes del modelo (Notas técnicas de la spec). NUNCA enviar
// temperature/top_p/top_k ni budget_tokens: devuelven 400 en este modelo.
const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 4096
/** Tope del motivo por objetivo: ~50 palabras. Mismo número en schema y prompt. */
const REASON_MAX_CHARS = 400
/** Últimos caracteres de la conversación incluidos en el prompt de evaluación. */
export const TRANSCRIPT_EVALUATION_MAX_CHARS = 120000

/** Schema de structured outputs: una evaluación por objetivo, en orden. */
const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    evaluations: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          met: { type: 'boolean' as const },
          reason: { type: 'string' as const, maxLength: REASON_MAX_CHARS }
        },
        required: ['met', 'reason'],
        additionalProperties: false
      }
    }
  },
  required: ['evaluations'],
  additionalProperties: false
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    'Eres el evaluador post-entrevista de un copiloto de discovery de producto, anclado a The Mom Test (Rob Fitzpatrick): un objetivo solo se considera cumplido si la conversación aporta evidencia concreta (hechos pasados, cifras, ejemplos reales), nunca cumplidos de cortesía, generalidades ni futuros hipotéticos.',
    'Recibirás los objetivos de la entrevista y la transcripción completa de la conversación. Tu tarea: evaluar el cumplimiento de CADA objetivo.',
    'Reglas:',
    '- Escribe TODO en español.',
    '- `evaluations`: exactamente una entrada por objetivo, EN EL MISMO ORDEN en que se listan.',
    '- `met`: true solo si la conversación aporta evidencia concreta que cubre el objetivo.',
    `- \`reason\`: el motivo por el que el objetivo se cumplió o no, en 30-50 palabras como máximo (nunca más de ${REASON_MAX_CHARS} caracteres), citando lo concreto que se obtuvo o lo que faltó.`,
    '- Si se incluyen índices marcados como cubiertos durante la llamada, son una pista NO vinculante del seguimiento en vivo: tu evaluación sobre la transcripción completa prevalece.',
    '- Responde únicamente con el JSON pedido.'
  ].join('\n')
}

function buildUserPrompt(
  objectives: string[],
  lines: TranscriptLine[],
  objectivesMetHint: number[]
): string {
  const sections: string[] = []

  const objectiveLines = objectives.map((objective, index) => `${index}. ${objective}`)
  sections.push(`## Objetivos de la entrevista\n${objectiveLines.join('\n')}`)

  if (objectivesMetHint.length > 0) {
    sections.push(
      `## Índices marcados como cubiertos durante la llamada (pista no vinculante)\n${objectivesMetHint.join(', ')}`
    )
  }

  // Mismo etiquetado por fuente/hablante que el asistente (SPEC-016)
  const conversation = lines
    .map((line) => {
      const speaker = line.speaker !== null ? ` s${line.speaker}` : ''
      return `[${line.channel}${speaker}] ${line.text}`
    })
    .join('\n')
    .slice(-TRANSCRIPT_EVALUATION_MAX_CHARS)
  sections.push(
    `## Conversación completa (mic = entrevistador, system = interlocutor)\n${conversation}`
  )

  sections.push(
    '## Tarea\nEvalúa el cumplimiento de cada objetivo y devuelve el JSON pedido, con una evaluación por objetivo en el mismo orden.'
  )

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Parseo defensivo
// ---------------------------------------------------------------------------

const FORMAT_ERROR_MESSAGE =
  'La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.'

/**
 * Valida la forma del JSON devuelto. Un array cuya longitud no case con los
 * objetivos se trata como fallo de formato (Notas técnicas): jamás se persiste
 * un resultado desalineado.
 */
function parseEvaluations(raw: string, objectiveCount: number): ObjectiveResult[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  const evaluations = (parsed as Record<string, unknown>).evaluations
  if (!Array.isArray(evaluations) || evaluations.length !== objectiveCount) {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  const results: ObjectiveResult[] = []
  for (const item of evaluations) {
    if (typeof item !== 'object' || item === null) {
      throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
    }
    const record = item as Record<string, unknown>
    if (typeof record.met !== 'boolean' || typeof record.reason !== 'string') {
      throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
    }
    results.push({ met: record.met, reason: record.reason.trim() })
  }
  return results
}

// ---------------------------------------------------------------------------
// Evaluación
// ---------------------------------------------------------------------------

/**
 * Guard anti concurrencia: una evaluación en curso por entrevista. Un click en
 * "Evaluar objetivos" mientras corre la evaluación automática se adhiere a la
 * misma promesa (patrón inFlight de llmService).
 */
const inFlight = new Map<string, Promise<Interview>>()

/**
 * Evalúa con Claude el cumplimiento de los objetivos de la entrevista contra
 * su transcript persistido y persiste el resultado. La persistencia solo
 * ocurre tras un parseo válido y alineado; ante cualquier error la entrevista
 * no cambia. Usada por el canal manual (`llm:evaluate-objectives`) y por el
 * camino automático post-grabación.
 */
export function evaluateInterviewObjectives(
  interviewId: string,
  objectivesMetHint: number[] = []
): Promise<Interview> {
  const existing = inFlight.get(interviewId)
  if (existing !== undefined) {
    return existing
  }
  const promise = doEvaluate(interviewId, objectivesMetHint).finally(() => {
    inFlight.delete(interviewId)
  })
  inFlight.set(interviewId, promise)
  return promise
}

async function doEvaluate(interviewId: string, objectivesMetHint: number[]): Promise<Interview> {
  const interview = repository.getInterview(interviewId)
  if (interview.objectives.length === 0) {
    throw new LlmOperationError('format', 'La entrevista no tiene objetivos que evaluar')
  }
  if (interview.transcriptPath === null) {
    throw new LlmOperationError('no-transcript', 'La entrevista no tiene transcripción asociada')
  }
  const apiKey = getAnthropicKey()
  if (apiKey === null) {
    throw new LlmOperationError(
      'no-key',
      'Configura tu clave de Anthropic en Ajustes para evaluar los objetivos'
    )
  }
  const transcript = readTranscriptLines(interview.transcriptPath)
  if (!transcript.ok || transcript.lines.length === 0) {
    throw new LlmOperationError('no-transcript', 'No se pudo leer la transcripción')
  }

  const client = new Anthropic({ apiKey })
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(interview.objectives, transcript.lines, objectivesMetHint)
        }
      ]
    })
  } catch (error) {
    throw mapSdkError(error)
  }

  if (response.stop_reason !== 'end_turn') {
    throw new LlmOperationError(
      'format',
      `La evaluación no terminó correctamente (stop_reason: ${String(response.stop_reason)}). Vuelve a intentarlo.`
    )
  }
  // Filtrar bloques thinking: el JSON viene en el primer bloque text
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )
  if (textBlock === undefined) {
    throw new LlmOperationError(
      'format',
      'La respuesta de la IA no contiene texto. Vuelve a intentarlo.'
    )
  }
  const results = parseEvaluations(textBlock.text, interview.objectives.length)

  // Coste (SPEC-021): solo tras parseo válido y ANTES de persistir, para que
  // la Interview devuelta ya incluya el aiUsage actualizado. Jamás lanza.
  recordInterviewUsage(interview.id, extractUsage(response))

  // Persistir SOLO tras parseo válido (ante error la entrevista no cambia)
  return repository.setInterviewObjectiveResults(interview.id, results)
}

// ---------------------------------------------------------------------------
// Camino automático post-grabación
// ---------------------------------------------------------------------------

function emitEvaluationEvent(event: ObjectiveEvaluationEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('llm:objective-evaluation', event)
    }
  }
}

/**
 * Límite de coste configurado (SPEC-021), leído con try/catch obligatorio: un
 * store ilegible se comporta como "sin límite" (patrón assistantService).
 */
function readLimitUsd(): number | null {
  try {
    return repository.getAiCostSettings().limitUsd
  } catch {
    return null
  }
}

/**
 * Dispara la evaluación automática tras `recording:stop` (SPEC-025).
 * Fire-and-forget y SIEMPRE silencioso en sus guards: sin objetivos, sin
 * transcript con líneas, sin clave o con el límite de coste ya superado no se
 * lanza ninguna llamada y la parada de la grabación no se ve afectada. El
 * progreso y el resultado viajan como eventos `llm:objective-evaluation`; si
 * el usuario navegó fuera, el resultado queda persistido igualmente.
 */
export function maybeEvaluateAfterRecording(
  interviewId: string,
  objectivesMetHint: number[]
): void {
  let interview: Interview
  try {
    interview = repository.getInterview(interviewId)
  } catch {
    return
  }
  if (interview.objectives.length === 0 || interview.transcriptPath === null) {
    return
  }
  if (getAnthropicKey() === null) {
    return
  }
  const transcript = readTranscriptLines(interview.transcriptPath)
  if (!transcript.ok || transcript.lines.length === 0) {
    return
  }
  // Límite de coste (SPEC-021): mismo redondeo hacia arriba que la pausa del
  // asistente — con el acumulado ya en el límite, la evaluación no se lanza.
  const limitUsd = readLimitUsd()
  if (limitUsd !== null && roundUpUsd(interview.aiUsage?.estimatedCostUsd ?? 0) >= limitUsd) {
    return
  }

  emitEvaluationEvent({ interviewId, status: 'evaluating' })
  evaluateInterviewObjectives(interviewId, objectivesMetHint)
    .then((updated) => {
      emitEvaluationEvent({ interviewId, status: 'done', interview: updated })
    })
    .catch((error: unknown) => {
      emitEvaluationEvent({ interviewId, status: 'error', error: toLlmError(error) })
    })
}
