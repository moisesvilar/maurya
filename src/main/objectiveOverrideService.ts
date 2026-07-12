import Anthropic from '@anthropic-ai/sdk'
import type { Interview } from '../renderer/src/types/domain'
import { getAnthropicKey, mapSdkError, LlmOperationError } from './llmService'
import { extractUsage, recordInterviewUsage } from './aiCost'
import * as repository from './db/repository'

/**
 * Marca manual de cumplimiento de objetivos con reescritura de la explicación
 * (SPEC-028). Vive SOLO en main (patrón objectiveEvaluationService): el SDK de
 * Anthropic y la clave jamás llegan al renderer; por IPC solo viajan el
 * interviewId, el índice, la marca, el comentario y la Interview actualizada.
 *
 * Invariantes:
 * - Degradable: sin clave de Anthropic la marca se persiste con
 *   `text = comment` y cero llamadas al LLM (principio del asistente inerte).
 * - Marca+texto son unidad atómica: ante cualquier fallo (SDK, stop_reason,
 *   parseo) NADA se persiste — ni la marca (decisión de la spec).
 * - Sin guard de límite de coste: acción manual explícita (patrón "Evaluar
 *   objetivos" de SPEC-025).
 * - Sin guard inFlight: el Dialog es modal y el botón Guardar queda disabled
 *   durante el guardado.
 */

// Constantes del modelo (Notas técnicas de la spec). NUNCA enviar
// temperature/top_p/top_k ni budget_tokens: devuelven 400 en este modelo.
const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 4096
/** Tope de la explicación reescrita: ~50 palabras (mismo que REASON_MAX_CHARS de SPEC-025). */
const TEXT_MAX_CHARS = 400

/** Schema de structured outputs: la explicación reescrita. */
const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    text: { type: 'string' as const, maxLength: TEXT_MAX_CHARS }
  },
  required: ['text'],
  additionalProperties: false
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    'Eres el redactor de explicaciones de cumplimiento de objetivos de un copiloto de discovery de producto, anclado a The Mom Test (Rob Fitzpatrick): las explicaciones se apoyan en evidencia concreta (hechos pasados, cifras, ejemplos reales), nunca en cumplidos de cortesía ni generalidades.',
    'El entrevistador ha corregido a mano el veredicto de cumplimiento de un objetivo y aporta un comentario que lo justifica. Tu tarea: redactar la explicación definitiva del veredicto.',
    'Reglas:',
    '- Escribe TODO en español.',
    `- \`text\`: la explicación definitiva, en 30-50 palabras como máximo (nunca más de ${TEXT_MAX_CHARS} caracteres), en el mismo estilo que los motivos de una evaluación post-entrevista.`,
    '- Integra el comentario del entrevistador como fuente principal.',
    '- Si se aporta la explicación previa de la evaluación automática, conserva la evidencia concreta compatible con el veredicto manual (cifras, hechos); descarta lo que lo contradiga.',
    '- La explicación debe ser coherente con el veredicto manual del entrevistador.',
    '- Responde únicamente con el JSON pedido.'
  ].join('\n')
}

function buildUserPrompt(
  objective: string,
  met: boolean,
  comment: string,
  previous: { met: boolean; reason: string } | null
): string {
  const sections: string[] = []

  sections.push(`## Objetivo\n${objective}`)
  sections.push(`## Veredicto manual del entrevistador\n${met ? 'Cumplido' : 'No cumplido'}`)
  sections.push(`## Comentario del entrevistador\n${comment}`)

  if (previous !== null) {
    sections.push(
      `## Explicación previa de la evaluación automática (evidencia a integrar)\nVeredicto: ${previous.met ? 'Cumplido' : 'No cumplido'}\n${previous.reason}`
    )
  }

  sections.push(
    '## Tarea\nRedacta la explicación definitiva del veredicto manual y devuelve el JSON pedido.'
  )

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Parseo defensivo
// ---------------------------------------------------------------------------

const FORMAT_ERROR_MESSAGE =
  'La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.'

/** Valida la forma del JSON devuelto: `text` string no vacío tras trim. */
function parseRewrittenText(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  const text = (parsed as Record<string, unknown>).text
  if (typeof text !== 'string' || text.trim() === '') {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  return text.trim()
}

// ---------------------------------------------------------------------------
// Marca manual con reescritura
// ---------------------------------------------------------------------------

/**
 * Persiste la marca manual de cumplimiento de un objetivo (SPEC-028),
 * reescribiendo la explicación con Claude a partir del comentario del humano
 * y de la evidencia de la evaluación previa (si existe). Sin clave de
 * Anthropic no hay llamada: se persiste el comentario literal como
 * explicación. Ante cualquier fallo NADA se persiste (marca+texto son unidad
 * atómica). Usada por el canal `llm:override-objective`.
 */
export async function overrideInterviewObjective(
  interviewId: string,
  objectiveIndex: number,
  met: boolean,
  comment: string
): Promise<Interview> {
  // Guards de entrada, antes de cualquier llamada (defensa en profundidad; el
  // renderer ya valida el comentario y el índice sale de la lista renderizada).
  const interview = repository.getInterview(interviewId)
  if (
    !Number.isInteger(objectiveIndex) ||
    objectiveIndex < 0 ||
    objectiveIndex >= interview.objectives.length
  ) {
    throw new LlmOperationError('format', 'El objetivo indicado no existe en la entrevista')
  }
  const trimmed = comment.trim()
  if (trimmed === '') {
    throw new LlmOperationError('format', 'El comentario es obligatorio')
  }

  // Sin clave de Anthropic: NO es error (feature degradable, principio del
  // asistente inerte) — cero llamadas y el comentario literal como explicación.
  const apiKey = getAnthropicKey()
  if (apiKey === null) {
    return repository.setInterviewObjectiveOverride(interview.id, objectiveIndex, {
      met,
      comment: trimmed,
      text: trimmed
    })
  }

  const objective = interview.objectives[objectiveIndex]
  const previous = interview.objectiveResults?.[objectiveIndex] ?? null

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
          content: buildUserPrompt(objective, met, trimmed, previous)
        }
      ]
    })
  } catch (error) {
    throw mapSdkError(error)
  }

  if (response.stop_reason !== 'end_turn') {
    throw new LlmOperationError(
      'format',
      `La reescritura no terminó correctamente (stop_reason: ${String(response.stop_reason)}). Vuelve a intentarlo.`
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
  const rewritten = parseRewrittenText(textBlock.text)

  // Coste (SPEC-021): solo tras parseo válido y ANTES de persistir, para que
  // la Interview devuelta ya incluya el aiUsage actualizado. Jamás lanza.
  recordInterviewUsage(interview.id, extractUsage(response))

  // Persistencia atómica en un único mutate, SOLO tras parseo válido
  return repository.setInterviewObjectiveOverride(interview.id, objectiveIndex, {
    met,
    comment: trimmed,
    text: rewritten
  })
}
