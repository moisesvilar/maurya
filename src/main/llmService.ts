import { readFileSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'
import type {
  Contact,
  Interview,
  InterviewTemplate,
  Note,
  Company
} from '../renderer/src/types/domain'
import type { LlmError, LlmErrorKind, LlmStatus } from '../renderer/src/types/llm'
import { getDecryptedSecret } from './secretsService'
import * as repository from './db/repository'

/**
 * Servicio de generación de guión y objetivos con Claude (SPEC-014). Vive SOLO
 * en main: el SDK de Anthropic y la clave jamás llegan al renderer.
 *
 * Invariantes de seguridad:
 * - La clave se resuelve en cada llamada (Ajustes cifrados → .env.local → null)
 *   y NUNCA se loguea ni viaja por IPC.
 * - La entrevista solo se persiste (guión + objetivos + status 'prepared') tras
 *   parsear y validar la respuesta: un fallo de API o de formato no cambia nada.
 */

// Constantes del modelo (Notas técnicas de la spec). NUNCA enviar
// temperature/top_p/top_k ni budget_tokens: devuelven 400 en este modelo.
const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 16000
/** Máximo de caracteres (finales) de cada transcript/nota del contexto histórico. */
const TRANSCRIPT_EXCERPT_CHARS = 8000
/** Máximo de entrevistas anteriores incluidas en el contexto histórico. */
const MAX_PREVIOUS_INTERVIEWS = 5

/**
 * Schema de structured outputs: la respuesta es SIEMPRE este JSON. El rango de
 * objetivos (3-7) se pide por prompt: json_schema no soporta minItems/maxItems.
 */
const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    scriptMarkdown: { type: 'string' as const },
    objectives: { type: 'array' as const, items: { type: 'string' as const } }
  },
  required: ['scriptMarkdown', 'objectives'],
  additionalProperties: false
}

/** Error interno tipado de la capa LLM; el IPC lo aplana a LlmError. */
export class LlmOperationError extends Error {
  readonly kind: LlmErrorKind

  constructor(kind: LlmErrorKind, message: string) {
    super(message)
    this.name = 'LlmOperationError'
    this.kind = kind
  }
}

/** Aplana cualquier error a LlmError; lo no tipado se reporta como `format`. */
export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmOperationError) {
    return { kind: error.kind, message: error.message }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { kind: 'format', message }
}

/**
 * Resolución de la clave de Anthropic (patrón SPEC-007), re-evaluada en cada
 * uso: 1º clave de Ajustes (cifrada con safeStorage) → 2º ANTHROPIC_API_KEY de
 * .env.local (fallback de desarrollo) → 3º null (estado UI 'sin clave').
 */
function getAnthropicKey(): string | null {
  const fromSettings = getDecryptedSecret('anthropic')
  if (fromSettings !== null) {
    return fromSettings
  }
  const key = process.env['ANTHROPIC_API_KEY']?.trim()
  return key !== undefined && key !== '' ? key : null
}

/** Estado para la UI: si hay clave resoluble. El valor jamás sale de main. */
export function getLlmStatus(): LlmStatus {
  return { hasAnthropicKey: getAnthropicKey() !== null }
}

// ---------------------------------------------------------------------------
// Contexto histórico
// ---------------------------------------------------------------------------

interface HistoricalEntry {
  interview: Interview
  transcriptExcerpt: string | null
  noteExcerpt: string | null
}

/**
 * Lee el transcript.json de una entrevista anterior y lo aplana a texto
 * "[canal] texto" por línea, truncado a los últimos TRANSCRIPT_EXCERPT_CHARS.
 * Best-effort: un archivo ausente o corrupto se omite sin romper la generación.
 */
function readTranscriptExcerpt(transcriptPath: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(transcriptPath, 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const lines = (parsed as Record<string, unknown>)['lines']
    if (!Array.isArray(lines)) {
      return null
    }
    const text = lines
      .map((line: unknown): string => {
        if (typeof line !== 'object' || line === null) {
          return ''
        }
        const record = line as Record<string, unknown>
        if (typeof record.text !== 'string' || record.text === '') {
          return ''
        }
        const channel = typeof record.channel === 'string' ? record.channel : '?'
        const speaker = typeof record.speaker === 'number' ? ` s${record.speaker}` : ''
        return `[${channel}${speaker}] ${record.text}`
      })
      .filter((line) => line !== '')
      .join('\n')
    return text === '' ? null : text.slice(-TRANSCRIPT_EXCERPT_CHARS)
  } catch {
    return null
  }
}

/**
 * Entrevistas anteriores de la misma empresa con material útil (transcript
 * legible o nota), de más reciente a más antigua, cap MAX_PREVIOUS_INTERVIEWS.
 */
function collectHistoricalContext(
  companyId: string,
  excludeInterviewId: string
): HistoricalEntry[] {
  const previous = repository
    .listInterviews(companyId)
    .filter((interview) => interview.id !== excludeInterviewId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const entries: HistoricalEntry[] = []
  for (const interview of previous) {
    if (entries.length >= MAX_PREVIOUS_INTERVIEWS) {
      break
    }
    const transcriptExcerpt =
      interview.transcriptPath !== null ? readTranscriptExcerpt(interview.transcriptPath) : null
    let note: Note | null = null
    try {
      note = repository.getNoteByInterview(interview.id)
    } catch {
      note = null
    }
    const noteContent = note?.contentMarkdown.trim() ?? ''
    const noteExcerpt = noteContent !== '' ? noteContent.slice(-TRANSCRIPT_EXCERPT_CHARS) : null
    if (transcriptExcerpt !== null || noteExcerpt !== null) {
      entries.push({ interview, transcriptExcerpt, noteExcerpt })
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<string, string> = {
  exploratory: 'exploratoria',
  problem: 'de problema',
  solution: 'de solución'
}

function buildSystemPrompt(template: InterviewTemplate): string {
  const phase =
    template.phase !== null
      ? ` La entrevista es de fase ${PHASE_LABELS[template.phase] ?? template.phase}.`
      : ''
  return [
    'Eres un preparador experto de entrevistas de discovery de producto, anclado a los principios de The Mom Test (Rob Fitzpatrick) y Running Lean (Ash Maurya): preguntas sobre hechos pasados y comportamiento concreto, nunca hipótesis halagadoras; escuchar más que hablar; validar problemas antes que soluciones.' +
      phase,
    'Tu tarea: adaptar el template de entrevista proporcionado a la empresa y al contacto concretos, y definir los objetivos de la entrevista.',
    'Reglas:',
    '- Escribe TODO en español.',
    '- `scriptMarkdown`: el guión completo en markdown, conservando la estructura de bloques del template (títulos, preguntas y guías adaptadas al caso concreto).',
    '- `objectives`: entre 3 y 7 objetivos concretos y accionables para esta entrevista, uno por elemento.',
    '- Si hay entrevistas anteriores con la misma empresa, NO repitas lo ya validado: usa ese contexto para profundizar en lo pendiente y referencia lo aprendido.',
    '- Responde únicamente con el JSON pedido.'
  ].join('\n')
}

function serializeTemplate(template: InterviewTemplate): string {
  const lines: string[] = [`Template: ${template.name}`]
  template.blocks.forEach((block, blockIndex) => {
    lines.push(`\nBloque ${blockIndex + 1}: ${block.title}`)
    if (block.guidance !== undefined && block.guidance !== '') {
      lines.push(`Guía del bloque: ${block.guidance}`)
    }
    block.questions.forEach((question, questionIndex) => {
      lines.push(`  ${blockIndex + 1}.${questionIndex + 1} ${question.text}`)
      if (question.guidance !== undefined && question.guidance !== '') {
        lines.push(`      Guía: ${question.guidance}`)
      }
    })
  })
  return lines.join('\n')
}

function buildUserPrompt(
  interview: Interview,
  company: Company,
  contact: Contact | null,
  template: InterviewTemplate,
  history: HistoricalEntry[]
): string {
  const sections: string[] = []

  const companyLines = [`Nombre: ${company.name}`]
  if (company.website !== null) {
    companyLines.push(`Web: ${company.website}`)
  }
  if (company.linkedinUrl !== null) {
    companyLines.push(`LinkedIn: ${company.linkedinUrl}`)
  }
  sections.push(`## Empresa\n${companyLines.join('\n')}`)

  if (contact !== null) {
    const contactLines = [`Nombre: ${contact.name}`]
    if (contact.position !== null) {
      contactLines.push(`Cargo: ${contact.position}`)
    }
    if (contact.linkedinUrl !== null) {
      contactLines.push(`LinkedIn: ${contact.linkedinUrl}`)
    }
    sections.push(`## Contacto\n${contactLines.join('\n')}`)
  } else {
    sections.push('## Contacto\nSin contacto asignado todavía.')
  }

  sections.push(`## Template de entrevista\n${serializeTemplate(template)}`)

  if (history.length > 0) {
    const historyBlocks = history.map((entry) => {
      const parts = [`### ${entry.interview.title} (${entry.interview.createdAt})`]
      if (entry.transcriptExcerpt !== null) {
        parts.push(`Transcripción (extracto final):\n${entry.transcriptExcerpt}`)
      }
      if (entry.noteExcerpt !== null) {
        parts.push(`Nota:\n${entry.noteExcerpt}`)
      }
      return parts.join('\n')
    })
    sections.push(`## Entrevistas anteriores con esta empresa\n${historyBlocks.join('\n\n')}`)
  }

  sections.push(
    `## Tarea\nGenera el guión personalizado y los objetivos para la entrevista "${interview.title}".`
  )

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------

interface GeneratedScript {
  scriptMarkdown: string
  objectives: string[]
}

/** Valida la forma del JSON devuelto y descarta objetivos vacíos. */
function parseGeneratedScript(raw: string): GeneratedScript {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new LlmOperationError(
      'format',
      'La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.'
    )
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new LlmOperationError(
      'format',
      'La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.'
    )
  }
  const record = parsed as Record<string, unknown>
  const scriptMarkdown = record.scriptMarkdown
  const objectives = record.objectives
  if (
    typeof scriptMarkdown !== 'string' ||
    scriptMarkdown.trim() === '' ||
    !Array.isArray(objectives) ||
    !objectives.every((item): item is string => typeof item === 'string')
  ) {
    throw new LlmOperationError(
      'format',
      'La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.'
    )
  }
  return {
    scriptMarkdown,
    objectives: objectives.map((item) => item.trim()).filter((item) => item !== '')
  }
}

/**
 * Mapea las excepciones tipadas del SDK a LlmOperationError. El orden importa:
 * APIConnectionError es subclase de APIError en el SDK de TypeScript, así que
 * se comprueba ANTES. Los mensajes nunca incluyen la clave.
 */
function mapSdkError(error: unknown): LlmOperationError {
  if (error instanceof LlmOperationError) {
    return error
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new LlmOperationError('auth', 'La clave de Anthropic no es válida. Revísala en Ajustes.')
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmOperationError(
      'rate-limit',
      'Se ha alcanzado el límite de uso de la API de Anthropic. Inténtalo de nuevo más tarde.'
    )
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmOperationError(
      'connection',
      'No se pudo conectar con la API de Anthropic. Comprueba tu conexión e inténtalo de nuevo.'
    )
  }
  if (error instanceof Anthropic.APIError) {
    return new LlmOperationError(
      'connection',
      `La API de Anthropic devolvió un error: ${error.message}`
    )
  }
  return new LlmOperationError(
    'format',
    `Error inesperado durante la generación: ${error instanceof Error ? error.message : String(error)}`
  )
}

/** Guard anti doble-click: una generación en curso por entrevista. */
const inFlight = new Map<string, Promise<Interview>>()

/**
 * Genera con Claude el guión personalizado y los objetivos de la entrevista y
 * los persiste junto con `status: 'prepared'`. La persistencia solo ocurre
 * tras un parseo válido; ante cualquier error la entrevista no cambia.
 */
export function generateInterviewScript(interviewId: string): Promise<Interview> {
  const existing = inFlight.get(interviewId)
  if (existing !== undefined) {
    return existing
  }
  const promise = doGenerate(interviewId).finally(() => {
    inFlight.delete(interviewId)
  })
  inFlight.set(interviewId, promise)
  return promise
}

async function doGenerate(interviewId: string): Promise<Interview> {
  const interview = repository.getInterview(interviewId)
  if (interview.templateId === null) {
    throw new LlmOperationError('no-template', 'Asigna un template para generar el guión')
  }
  const apiKey = getAnthropicKey()
  if (apiKey === null) {
    throw new LlmOperationError(
      'no-key',
      'Configura tu clave de Anthropic en Ajustes para generar el guión'
    )
  }

  const company = repository.getCompany(interview.companyId)
  const contact = interview.contactId !== null ? repository.getContact(interview.contactId) : null
  const template = repository.getInterviewTemplate(interview.templateId)
  const history = collectHistoricalContext(interview.companyId, interview.id)

  const client = new Anthropic({ apiKey })
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: buildSystemPrompt(template),
      messages: [
        { role: 'user', content: buildUserPrompt(interview, company, contact, template, history) }
      ]
    })
  } catch (error) {
    throw mapSdkError(error)
  }

  if (response.stop_reason !== 'end_turn') {
    throw new LlmOperationError(
      'format',
      `La generación no terminó correctamente (stop_reason: ${String(response.stop_reason)}). Vuelve a intentarlo.`
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
  const generated = parseGeneratedScript(textBlock.text)

  // Persistir SOLO tras parseo válido (AC: ante error la entrevista no cambia)
  return repository.updateInterview(interview.id, {
    scriptMarkdown: generated.scriptMarkdown,
    objectives: generated.objectives,
    status: 'prepared'
  })
}
