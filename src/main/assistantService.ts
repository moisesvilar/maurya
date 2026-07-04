import Anthropic from '@anthropic-ai/sdk'
import type { WebContents } from 'electron'
import type { TranscriptLine } from '../renderer/src/types/audio'
import type {
  AssistantAlarm,
  AssistantSessionSummary,
  AssistantSuggestion,
  AssistantUpdateEvent,
  AssistantVote
} from '../renderer/src/types/assistant'
import type { LlmError } from '../renderer/src/types/llm'
import { getAnthropicKey, mapSdkError, toLlmError, LlmOperationError } from './llmService'
import { setFinalLineListener } from './transcriptionService'
import * as repository from './db/repository'

/**
 * Asistente proactivo en tiempo real (SPEC-016). Vive SOLO en main (patrón
 * llmService + transcriptionService): el SDK de Anthropic y la clave jamás
 * llegan al renderer; por IPC solo viajan eventos tipados.
 *
 * Invariantes:
 * - Solo se activa con `interviewId` (nunca en /capture). Sin clave de
 *   Anthropic queda INERTE: cero timers, cero listeners, cero llamadas.
 * - Control de coste: nunca dos llamadas simultáneas (guard inFlight),
 *   intervalo mínimo entre llamadas y solo con material nuevo suficiente.
 * - Un error de análisis NO resetea los contadores: el material acumulado
 *   provoca el reintento natural en la siguiente ventana.
 * - `stopAssistant()` es síncrono y debe llamarse ANTES de persistTranscript.
 */

// --- Constantes de control de coste (Notas técnicas; ajustables) ------------

/** Mínimo de líneas finales nuevas desde el último análisis para disparar otro. */
export const MIN_NEW_FINAL_LINES = 3
/** Intervalo mínimo entre llamadas a la API. */
export const MIN_INTERVAL_MS = 20000
/** Temporizador de respaldo: analiza con ≥1 línea nueva aunque no lleguen 3. */
export const FALLBACK_INTERVAL_MS = 45000
/** Últimos caracteres de conversación incluidos en el prompt. */
export const TRANSCRIPT_WINDOW_CHARS = 4000
/** Máximo de caracteres del guión incluidos en el prompt. */
export const SCRIPT_EXCERPT_CHARS = 6000

// Constantes del modelo (documentadas; ajustables si el humano quiere otro
// equilibrio latencia/coste). NUNCA enviar temperature/top_p/top_k ni
// budget_tokens: devuelven 400 en este modelo.
const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 1024

/** Schema de structured outputs: la respuesta del análisis es SIEMPRE este JSON. */
const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    action: { type: 'string' as const, enum: ['dig_deeper', 'continue'] },
    suggestedQuestion: { type: 'string' as const },
    reason: { type: 'string' as const },
    alarms: {
      type: 'array' as const,
      items: { type: 'string' as const, enum: ['compliment', 'generic', 'hypothetical'] }
    },
    objectivesMet: { type: 'array' as const, items: { type: 'integer' as const } }
  },
  required: ['action', 'suggestedQuestion', 'reason', 'alarms', 'objectivesMet'],
  additionalProperties: false
}

interface AssistantSession {
  sender: WebContents
  /** Objetivos de la entrevista (puede ser vacío: contexto recomendado, no obligatorio). */
  objectives: string[]
  /** Guión truncado a SCRIPT_EXCERPT_CHARS; null si la entrevista no tiene. */
  scriptExcerpt: string | null
  apiKey: string
  /** Buffer propio de líneas finales de la conversación. */
  lines: TranscriptLine[]
  newLinesSinceLastCall: number
  lastCallAtMs: number
  inFlight: boolean
  fallbackTimer: NodeJS.Timeout | null
  /** Última sugerencia válida (para no repetirse y para conservarla ante error). */
  suggestion: AssistantSuggestion | null
  /** Acumulativo: un objetivo marcado cubierto no vuelve a pendiente. */
  objectivesMet: Set<number>
  suggestionCount: number
  /** Voto de la sugerencia vigente (mutable hasta la siguiente sugerencia). */
  currentVote: AssistantVote | null
  feedback: { up: number; down: number }
}

let session: AssistantSession | null = null

function emitUpdate(target: AssistantSession, event: AssistantUpdateEvent): void {
  if (!target.sender.isDestroyed()) {
    target.sender.send('assistant:update', event)
  }
}

function sortedObjectivesMet(target: AssistantSession): number[] {
  return Array.from(target.objectivesMet).sort((a, b) => a - b)
}

/**
 * Activa el asistente para la grabación de una entrevista. Llamar SOLO desde
 * `recording:start` con interviewId (la asistencia no existe en /capture).
 * Sin clave de Anthropic emite 'no-key' y queda inerte (sin sesión, cero
 * llamadas). Guión y objetivos se cargan best-effort: su ausencia no bloquea.
 */
export function startAssistant(sender: WebContents, interviewId: string): void {
  if (session !== null) {
    stopAssistant()
  }
  const apiKey = getAnthropicKey()
  if (apiKey === null) {
    if (!sender.isDestroyed()) {
      const event: AssistantUpdateEvent = { state: 'no-key', objectivesMet: [] }
      sender.send('assistant:update', event)
    }
    return
  }

  let objectives: string[] = []
  let scriptExcerpt: string | null = null
  try {
    const interview = repository.getInterview(interviewId)
    objectives = interview.objectives
    scriptExcerpt =
      interview.scriptMarkdown !== null && interview.scriptMarkdown.trim() !== ''
        ? interview.scriptMarkdown.slice(0, SCRIPT_EXCERPT_CHARS)
        : null
  } catch {
    // Entrevista ilegible: el asistente funciona igualmente sin ese contexto
  }

  const target: AssistantSession = {
    sender,
    objectives,
    scriptExcerpt,
    apiKey,
    lines: [],
    newLinesSinceLastCall: 0,
    lastCallAtMs: 0,
    inFlight: false,
    fallbackTimer: null,
    suggestion: null,
    objectivesMet: new Set<number>(),
    suggestionCount: 0,
    currentVote: null,
    feedback: { up: 0, down: 0 }
  }
  session = target
  setFinalLineListener((line) => {
    handleFinalLine(target, line)
  })
  target.fallbackTimer = setInterval(() => {
    if (session === target) {
      maybeAnalyze(target, 1)
    }
  }, FALLBACK_INTERVAL_MS)
  emitUpdate(target, { state: 'idle', objectivesMet: [] })
}

function handleFinalLine(target: AssistantSession, line: TranscriptLine): void {
  if (session !== target) {
    return
  }
  target.lines.push(line)
  target.newLinesSinceLastCall += 1
  maybeAnalyze(target, MIN_NEW_FINAL_LINES)
}

/**
 * Evalúa los disparadores del análisis (control de coste): guard in-flight,
 * material nuevo mínimo (`minLines`: 3 por línea, 1 desde el respaldo) e
 * intervalo mínimo entre llamadas. Sin material nuevo → sin llamada.
 */
function maybeAnalyze(target: AssistantSession, minLines: number): void {
  if (target.inFlight) {
    return
  }
  if (target.newLinesSinceLastCall < minLines) {
    return
  }
  if (Date.now() - target.lastCallAtMs < MIN_INTERVAL_MS) {
    return
  }
  void runAnalysis(target)
}

async function runAnalysis(target: AssistantSession): Promise<void> {
  target.inFlight = true
  // La ventana de frecuencia cuenta desde el inicio de la llamada, también si
  // falla: ante error se "reintenta en la siguiente ventana", no en cascada.
  target.lastCallAtMs = Date.now()
  const linesAtCall = target.newLinesSinceLastCall
  // 'analyzing' viaja sin sugerencia: el hook conserva la anterior visible
  emitUpdate(target, { state: 'analyzing', objectivesMet: sortedObjectivesMet(target) })
  try {
    const suggestion = await requestSuggestion(target)
    if (session !== target) {
      return // respuesta tardía tras stop: se descarta
    }
    target.newLinesSinceLastCall -= linesAtCall
    target.suggestion = suggestion.suggestion
    target.suggestionCount += 1
    target.currentVote = null
    for (const index of suggestion.objectivesMet) {
      target.objectivesMet.add(index)
    }
    emitUpdate(target, {
      state: 'active',
      suggestion: suggestion.suggestion,
      objectivesMet: sortedObjectivesMet(target)
    })
  } catch (error) {
    if (session !== target) {
      return
    }
    // SIN resetear contadores: el material acumulado reintenta en la siguiente ventana
    const llmError: LlmError = toLlmError(mapSdkError(error))
    const event: AssistantUpdateEvent = {
      state: 'error',
      objectivesMet: sortedObjectivesMet(target),
      error: llmError
    }
    if (target.suggestion !== null) {
      event.suggestion = target.suggestion
    }
    emitUpdate(target, event)
  } finally {
    target.inFlight = false
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    'Eres el copiloto en tiempo real de un entrevistador de discovery de producto, anclado a The Mom Test (Rob Fitzpatrick) y Running Lean (Ash Maurya): hechos pasados y comportamiento concreto, nunca hipótesis halagadoras.',
    'Recibirás la ventana reciente de la conversación (transcrita en vivo, puede contener errores), los objetivos de la entrevista y el guión. Tu tarea: decidir la siguiente jugada del entrevistador.',
    'Reglas:',
    '- Escribe TODO en español.',
    "- `action`: 'dig_deeper' si la última respuesta del interlocutor carece de evidencia concreta (hechos pasados, cifras, ejemplos reales) o toca un objetivo aún no cubierto; 'continue' si ya hay material concreto suficiente para avanzar con el guión.",
    '- `suggestedQuestion`: la siguiente pregunta exacta que debe hacer el entrevistador, breve y sobre hechos pasados y comportamiento concreto.',
    "- `reason`: el porqué en UNA sola línea corta. Con 'dig_deeper', referencia el motivo concreto: la evidencia que falta según The Mom Test o el objetivo aún no cubierto.",
    "- `alarms`: señales de alarma detectadas en las últimas intervenciones del interlocutor: 'compliment' (cumplidos: «suena interesante»), 'generic' (genéricos: «normalmente hacemos»), 'hypothetical' (futuros hipotéticos: «lo compraríamos»). Array vacío si no hay. Si detectas una alarma, la pregunta sugerida debe reconducir a lo concreto (hechos pasados, casos reales).",
    '- `objectivesMet`: índices (0-based) de los objetivos YA cubiertos por la conversación, incluidos los que se marcaron cubiertos en análisis anteriores. Array vacío si no hay objetivos.',
    '- No repitas la sugerencia anterior: aporta la siguiente jugada.',
    '- Responde únicamente con el JSON pedido.'
  ].join('\n')
}

function buildUserPrompt(target: AssistantSession): string {
  const sections: string[] = []

  if (target.objectives.length > 0) {
    const objectiveLines = target.objectives.map((objective, index) => {
      const status = target.objectivesMet.has(index) ? 'cubierto' : 'pendiente'
      return `${index}. [${status}] ${objective}`
    })
    sections.push(`## Objetivos de la entrevista\n${objectiveLines.join('\n')}`)
  }

  if (target.scriptExcerpt !== null) {
    sections.push(`## Guión de la entrevista\n${target.scriptExcerpt}`)
  }

  const conversation = target.lines
    .map((line) => {
      const speaker = line.speaker !== null ? ` s${line.speaker}` : ''
      return `[${line.channel}${speaker}] ${line.text}`
    })
    .join('\n')
    .slice(-TRANSCRIPT_WINDOW_CHARS)
  sections.push(
    `## Conversación reciente (mic = entrevistador, system = interlocutor)\n${conversation}`
  )

  if (target.suggestion !== null) {
    sections.push(
      `## Tu sugerencia anterior (no la repitas)\nAcción: ${target.suggestion.action}\nPregunta: ${target.suggestion.suggestedQuestion}\nPorqué: ${target.suggestion.reason}`
    )
  }

  sections.push(
    '## Tarea\nAnaliza la conversación y devuelve la siguiente jugada del entrevistador en el JSON pedido.'
  )

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Llamada + parseo defensivo
// ---------------------------------------------------------------------------

interface AnalysisOutcome {
  suggestion: AssistantSuggestion
  objectivesMet: number[]
}

const FORMAT_ERROR_MESSAGE = 'La respuesta de la IA no tiene el formato esperado.'

/** Valida la forma del JSON devuelto; alarmas e índices fuera de rango se filtran. */
function parseAnalysis(raw: string, objectiveCount: number): AnalysisOutcome {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  const record = parsed as Record<string, unknown>
  const action = record.action
  const suggestedQuestion = record.suggestedQuestion
  const reason = record.reason
  if (
    (action !== 'dig_deeper' && action !== 'continue') ||
    typeof suggestedQuestion !== 'string' ||
    suggestedQuestion.trim() === '' ||
    typeof reason !== 'string'
  ) {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  const alarms: AssistantAlarm[] = Array.isArray(record.alarms)
    ? record.alarms.filter(
        (item): item is AssistantAlarm =>
          item === 'compliment' || item === 'generic' || item === 'hypothetical'
      )
    : []
  const objectivesMet: number[] = Array.isArray(record.objectivesMet)
    ? record.objectivesMet.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isInteger(item) && item >= 0 && item < objectiveCount
      )
    : []
  return {
    suggestion: {
      action,
      suggestedQuestion: suggestedQuestion.trim(),
      reason: reason.trim(),
      alarms
    },
    objectivesMet
  }
}

async function requestSuggestion(target: AssistantSession): Promise<AnalysisOutcome> {
  const client = new Anthropic({ apiKey: target.apiKey })
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(target) }]
    })
  } catch (error) {
    throw mapSdkError(error)
  }
  if (response.stop_reason !== 'end_turn') {
    throw new LlmOperationError(
      'format',
      `El análisis no terminó correctamente (stop_reason: ${String(response.stop_reason)}).`
    )
  }
  // Filtrar bloques thinking: el JSON viene en el primer bloque text
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )
  if (textBlock === undefined) {
    throw new LlmOperationError('format', 'La respuesta de la IA no contiene texto.')
  }
  return parseAnalysis(textBlock.text, target.objectives.length)
}

// ---------------------------------------------------------------------------
// Feedback + cierre
// ---------------------------------------------------------------------------

/**
 * Registra la valoración 👍/👎 de la sugerencia vigente. El voto es mutable
 * hasta la siguiente sugerencia (cambiar de 👍 a 👎 corrige los contadores).
 * Sin sesión o sin sugerencia es un no-op silencioso.
 */
export function sendAssistantFeedback(vote: AssistantVote): void {
  if (session === null || session.suggestion === null) {
    return
  }
  const target = session
  if (target.currentVote === vote) {
    return
  }
  if (target.currentVote !== null) {
    target.feedback[target.currentVote] -= 1
  }
  target.currentVote = vote
  target.feedback[vote] += 1
}

/**
 * Desactiva el asistente y devuelve el registro de la sesión para persistirlo
 * en el transcript.json. SÍNCRONO: llamar desde `recording:stop` ANTES de
 * persistTranscript (y en el camino de error, descartando el resultado).
 * Una respuesta de análisis todavía en vuelo se descarta (session !== target).
 * @returns null si el asistente no llegó a activarse (sin clave / sin entrevista).
 */
export function stopAssistant(): AssistantSessionSummary | null {
  if (session === null) {
    return null
  }
  const target = session
  session = null
  setFinalLineListener(null)
  if (target.fallbackTimer !== null) {
    clearInterval(target.fallbackTimer)
    target.fallbackTimer = null
  }
  return { suggestionCount: target.suggestionCount, feedback: { ...target.feedback } }
}
