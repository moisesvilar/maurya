import { readFileSync, writeFileSync } from 'fs'
import { dialog, type BrowserWindow, type SaveDialogOptions } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import type { Company, Contact, Interview, Note, NoteTemplate } from '../renderer/src/types/domain'
import type { TranscriptLine, TranscriptLinesResult } from '../renderer/src/types/audio'
import type { NoteGenerationResult } from '../renderer/src/types/llm'
import type {
  NoteExportError,
  NoteExportErrorKind,
  NoteExportOutcome,
  NoteExportTarget
} from '../renderer/src/types/notes'
import { LlmOperationError, getAnthropicKey, mapSdkError } from './llmService'
import { extractUsage, recordInterviewUsage } from './aiCost'
import * as repository from './db/repository'
import { buildPersonaBlock } from './prompts'

/**
 * Servicio de la nota de resumen de la entrevista (SPEC-017). Vive SOLO en
 * main: el SDK de Anthropic, la clave y el filesystem jamás llegan al renderer.
 *
 * Invariantes:
 * - La nota y el status 'summarized' se persisten SOLO tras parsear y validar
 *   el structured output: un fallo de API o de formato no cambia nada.
 * - La exportación usa el save dialog del SO; cancelar es un resultado neutro
 *   ({ saved: false }), nunca un error.
 */

// Constantes del modelo (Notas técnicas de la spec). NUNCA enviar
// temperature/top_p/top_k ni budget_tokens: devuelven 400 en este modelo.
const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 16000
/** Máximo de caracteres (finales) de la conversación incluida en el prompt. */
const TRANSCRIPT_PROMPT_CHARS = 60_000

/**
 * Schema de structured outputs: una entrada por sección del note-template. La
 * correspondencia 1:1 con las secciones del template se valida tras el parseo
 * (json_schema no soporta minItems/maxItems).
 */
const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    sections: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const },
          contentMarkdown: { type: 'string' as const }
        },
        required: ['title', 'contentMarkdown'],
        additionalProperties: false
      }
    }
  },
  required: ['sections'],
  additionalProperties: false
}

// ---------------------------------------------------------------------------
// Transcripción persistida
// ---------------------------------------------------------------------------

/**
 * Etiqueta de hablante de una línea de transcripción: mic → "Tú"; system →
 * "Interlocutor N" (1-based; sin diarización → 1). Duplicado deliberado de
 * `src/renderer/src/lib/speakerLabel.ts` para no importar código runtime del
 * renderer desde main: si cambias esto, cambia también aquel.
 */
function speakerLabel(line: Pick<TranscriptLine, 'channel' | 'speaker'>): string {
  if (line.channel === 'mic') {
    return 'Tú'
  }
  return `Interlocutor ${(line.speaker ?? 0) + 1}`
}

/**
 * Lee defensivamente las líneas finales del `.transcript.json` persistido
 * (forma `{ lines, latency, assistant }`, SPEC-003/016). Archivo ausente,
 * ilegible o sin la forma esperada → `{ ok: false, kind: 'unreadable' }`:
 * es un estado esperado de la UI, no una rejection.
 */
export function readTranscriptLines(transcriptPath: string): TranscriptLinesResult {
  const unreadable: TranscriptLinesResult = {
    ok: false,
    kind: 'unreadable',
    message: 'No se pudo leer la transcripción'
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(transcriptPath, 'utf-8'))
  } catch {
    return unreadable
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return unreadable
  }
  const rawLines = (parsed as Record<string, unknown>)['lines']
  if (!Array.isArray(rawLines)) {
    return unreadable
  }
  const lines: TranscriptLine[] = []
  for (const raw of rawLines) {
    if (typeof raw !== 'object' || raw === null) {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.text !== 'string' || record.text === '') {
      continue
    }
    lines.push({
      channel: record.channel === 'mic' ? 'mic' : 'system',
      text: record.text,
      startMs: typeof record.startMs === 'number' ? record.startMs : 0,
      endMs: typeof record.endMs === 'number' ? record.endMs : 0,
      receivedAtMs: typeof record.receivedAtMs === 'number' ? record.receivedAtMs : 0,
      speaker: typeof record.speaker === 'number' ? record.speaker : null
    })
  }
  return { ok: true, lines }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(template: NoteTemplate): string {
  // SPEC-031: el contexto del note-template es parte dinámica bloqueada —
  // elemento propio FUERA de los delimitadores del bloque de persona.
  const context =
    template.context.trim() !== ''
      ? `Contexto del note-template (manda sobre el enfoque de la síntesis):\n${template.context.trim()}`
      : null
  // SPEC-026: el bloque de persona/enfoque se resuelve en cada uso
  // (override de Ajustes → default); las reglas de abajo quedan bloqueadas.
  // SPEC-031: el bloque va delimitado y precedido de la salvaguarda anti-inyección.
  return [
    buildPersonaBlock('note'),
    ...(context !== null ? [context] : []),
    'Tu tarea: sintetizar la conversación proporcionada siguiendo las secciones del note-template, en su orden.',
    'Reglas:',
    '- Escribe TODO en español.',
    '- `sections`: exactamente una entrada por cada sección numerada del template, en el mismo orden, con su `title` y el `contentMarkdown` sintetizado de la conversación.',
    '- Aporta evidencia concreta: cita textualmente frases relevantes del interlocutor (entre comillas) y referencia hechos y ejemplos específicos de la conversación.',
    '- Distingue explícitamente los hechos relatados de tus inferencias o interpretaciones.',
    '- Si la conversación no aporta material para una sección, dilo honestamente en esa sección; no inventes contenido.',
    '- Responde únicamente con el JSON pedido.'
  ].join('\n')
}

function buildUserPrompt(
  interview: Interview,
  company: Company | null,
  contacts: Contact[],
  template: NoteTemplate,
  lines: TranscriptLine[]
): string {
  const sections: string[] = []

  // SPEC-020: la captura puede no tener empresa asignada todavía; la nota se
  // genera igual, declarándolo honestamente en el contexto.
  if (company !== null) {
    const companyLines = [`Nombre: ${company.name}`]
    if (company.website !== null) {
      companyLines.push(`Web: ${company.website}`)
    }
    if (company.linkedinUrl !== null) {
      companyLines.push(`LinkedIn: ${company.linkedinUrl}`)
    }
    // SPEC-046: contexto de la empresa (texto libre y/o generado con IA).
    if (company.context != null && company.context.trim() !== '') {
      companyLines.push(`Contexto: ${company.context}`)
    }
    sections.push(`## Empresa\n${companyLines.join('\n')}`)
  } else {
    sections.push('## Empresa\nSin empresa asignada.')
  }

  // SPEC-046: TODOS los participantes, un bloque por contacto en el orden de
  // contactIds; el texto de degradación se conserva EXACTO (SPEC-020).
  if (contacts.length > 0) {
    const contactBlocks = contacts.map((contact) => {
      const contactLines = [`Nombre: ${contact.name}`]
      if (contact.position !== null) {
        contactLines.push(`Cargo: ${contact.position}`)
      }
      if (contact.linkedinUrl !== null) {
        contactLines.push(`LinkedIn: ${contact.linkedinUrl}`)
      }
      if (contact.context != null && contact.context.trim() !== '') {
        contactLines.push(`Contexto: ${contact.context}`)
      }
      return contactLines.join('\n')
    })
    sections.push(`## Contactos\n${contactBlocks.join('\n\n')}`)
  } else {
    sections.push('## Contactos\nSin contacto asignado.')
  }

  const templateLines = template.sections.map(
    (section, index) => `${index + 1}. ${section.title} — ${section.description}`
  )
  sections.push(`## Secciones del note-template (en este orden)\n${templateLines.join('\n')}`)

  // Conversación etiquetada por hablante, truncada a los últimos
  // TRANSCRIPT_PROMPT_CHARS caracteres (límite constante y documentado)
  const conversation = lines
    .map((line) => `[${speakerLabel(line)}] ${line.text}`)
    .join('\n')
    .slice(-TRANSCRIPT_PROMPT_CHARS)
  sections.push(`## Conversación\n${conversation}`)

  // Desenlaces manuales de las preguntas del asistente (SPEC-039): secciones
  // condicionales — sin questionOutcomes el prompt es idéntico al anterior.
  const questionOutcomes = interview.questionOutcomes ?? []
  const discarded = questionOutcomes.filter((entry) => entry.outcome === 'discarded')
  if (discarded.length > 0) {
    const discardedLines = discarded.map(
      (entry) =>
        `- ${entry.question} — Motivo: ${
          entry.reason !== undefined && entry.reason !== null && entry.reason.trim() !== ''
            ? entry.reason
            : 'sin motivo indicado'
        }`
    )
    sections.push(
      `## Preguntas descartadas por el entrevistador (con su motivo)\n${discardedLines.join('\n')}`
    )
  }
  const answered = questionOutcomes.filter((entry) => entry.outcome === 'answered')
  if (answered.length > 0) {
    const answeredLines = answered.map((entry) => `- ${entry.question}`)
    sections.push(
      `## Preguntas ya respondidas marcadas por el entrevistador\n${answeredLines.join('\n')}`
    )
  }

  sections.push(
    `## Tarea\nGenera la nota de resumen de la entrevista "${interview.title}" siguiendo las secciones del note-template.`
  )

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------

interface GeneratedSection {
  title: string
  contentMarkdown: string
}

/** Valida la forma del JSON devuelto por el structured output. */
function parseGeneratedSections(raw: string): GeneratedSection[] {
  const formatError = new LlmOperationError(
    'format',
    'La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.'
  )
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw formatError
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw formatError
  }
  const sections = (parsed as Record<string, unknown>)['sections']
  if (
    !Array.isArray(sections) ||
    !sections.every(
      (item): item is GeneratedSection =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).title === 'string' &&
        typeof (item as Record<string, unknown>).contentMarkdown === 'string'
    )
  ) {
    throw formatError
  }
  return sections
}

/** Guard anti doble-click: una generación en curso por entrevista. */
const inFlight = new Map<string, Promise<NoteGenerationResult>>()

/**
 * Genera con Claude la nota de resumen de la entrevista según el note-template
 * y la persiste (createNote/updateNote) junto con `status: 'summarized'`. La
 * persistencia solo ocurre tras un parseo válido; ante cualquier error la
 * entrevista y su nota previa quedan intactas.
 */
export function generateInterviewNote(
  interviewId: string,
  noteTemplateId: string
): Promise<NoteGenerationResult> {
  const existing = inFlight.get(interviewId)
  if (existing !== undefined) {
    return existing
  }
  const promise = doGenerate(interviewId, noteTemplateId).finally(() => {
    inFlight.delete(interviewId)
  })
  inFlight.set(interviewId, promise)
  return promise
}

async function doGenerate(
  interviewId: string,
  noteTemplateId: string
): Promise<NoteGenerationResult> {
  const interview = repository.getInterview(interviewId)
  if (interview.transcriptPath === null) {
    throw new LlmOperationError('no-transcript', 'Graba la entrevista para poder generar la nota.')
  }
  const apiKey = getAnthropicKey()
  if (apiKey === null) {
    throw new LlmOperationError(
      'no-key',
      'Configura tu clave de Anthropic en Ajustes para generar la nota'
    )
  }
  const template = repository.getNoteTemplate(noteTemplateId)
  if (template.sections.length === 0) {
    throw new LlmOperationError(
      'format',
      'El note-template no tiene secciones. Añádelas para generar la nota.'
    )
  }
  const transcript = readTranscriptLines(interview.transcriptPath)
  if (!transcript.ok) {
    throw new LlmOperationError('no-transcript', 'No se pudo leer la transcripción')
  }

  // SPEC-020: empresa nullable en capturas capture-first; el prompt degrada.
  const company = interview.companyId !== null ? repository.getCompany(interview.companyId) : null
  // SPEC-046: TODOS los contactos, en el orden de contactIds (la invariante
  // v3 del repositorio garantiza que las referencias resuelven).
  const contacts = interview.contactIds.map((contactId) => repository.getContact(contactId))

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
        {
          role: 'user',
          content: buildUserPrompt(interview, company, contacts, template, transcript.lines)
        }
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
  const generated = parseGeneratedSections(textBlock.text)
  if (generated.length !== template.sections.length) {
    throw new LlmOperationError(
      'format',
      'La respuesta de la IA no cubre todas las secciones del note-template. Vuelve a intentarlo.'
    )
  }

  // Medición del coste (SPEC-021): solo tras parseo y validación completos
  // (una llamada que falla no cambia el acumulado) y ANTES de persistir, para
  // que la Interview devuelta ya incluya el aiUsage. Best-effort: jamás lanza.
  recordInterviewUsage(interview.id, extractUsage(response))

  // Los títulos del template son la fuente de verdad; el contenido, de la IA
  const contentMarkdown = template.sections
    .map((section, index) => `## ${section.title}\n\n${generated[index].contentMarkdown.trim()}`)
    .join('\n\n')

  // Persistir SOLO tras parseo válido (AC: ante error nada cambia)
  const previous = repository.getNoteByInterview(interview.id)
  const note: Note =
    previous !== null
      ? repository.updateNote(previous.id, { contentMarkdown })
      : repository.createNote({ interviewId: interview.id, contentMarkdown })
  const updated = repository.updateInterview(interview.id, { status: 'summarized' })
  return { interview: updated, note }
}

// ---------------------------------------------------------------------------
// Exportación a Markdown
// ---------------------------------------------------------------------------

/** Error interno tipado de la exportación; el IPC lo aplana a NoteExportError. */
export class NoteExportOperationError extends Error {
  readonly kind: NoteExportErrorKind

  constructor(kind: NoteExportErrorKind, message: string) {
    super(message)
    this.name = 'NoteExportOperationError'
    this.kind = kind
  }
}

/** Aplana cualquier error a NoteExportError; lo no tipado se reporta como `not-found`. */
export function toNoteExportError(error: unknown): NoteExportError {
  if (error instanceof NoteExportOperationError) {
    return { kind: error.kind, message: error.message }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { kind: 'not-found', message }
}

/** Slug del título para el nombre por defecto del archivo exportado. */
function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug !== '' ? slug : 'entrevista'
}

/** Contenido Markdown a exportar según el destino; lanza tipado si no hay material. */
function buildExportContent(interview: Interview, target: NoteExportTarget): string {
  if (target === 'note') {
    const note = repository.getNoteByInterview(interview.id)
    if (note === null || note.contentMarkdown.trim() === '') {
      throw new NoteExportOperationError('no-content', 'La entrevista no tiene nota que exportar')
    }
    return note.contentMarkdown
  }
  if (interview.transcriptPath === null) {
    throw new NoteExportOperationError(
      'no-content',
      'La entrevista no tiene transcripción que exportar'
    )
  }
  const transcript = readTranscriptLines(interview.transcriptPath)
  if (!transcript.ok) {
    throw new NoteExportOperationError('no-content', 'No se pudo leer la transcripción')
  }
  // Una línea por intervención con su hablante (RF-NOTE-005)
  return transcript.lines.map((line) => `**${speakerLabel(line)}:** ${line.text}`).join('\n')
}

/**
 * Exporta la nota o la transcripción de la entrevista como Markdown vía
 * `dialog.showSaveDialog` (convención de escritorio). Cancelar el diálogo es
 * un resultado neutro `{ saved: false }`; un fallo de escritura lanza `write`.
 */
export async function exportInterviewDocument(
  window: BrowserWindow | null,
  interviewId: string,
  target: NoteExportTarget
): Promise<NoteExportOutcome> {
  let interview: Interview
  try {
    interview = repository.getInterview(interviewId)
  } catch (error) {
    throw new NoteExportOperationError(
      'not-found',
      error instanceof Error ? error.message : String(error)
    )
  }
  const content = buildExportContent(interview, target)
  const suffix = target === 'note' ? '-nota.md' : '-transcripcion.md'
  const options: SaveDialogOptions = {
    defaultPath: `${slugify(interview.title)}${suffix}`,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  }
  const result =
    window !== null
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
  if (result.canceled || result.filePath === undefined || result.filePath === '') {
    return { saved: false, filePath: null }
  }
  try {
    writeFileSync(result.filePath, content, 'utf-8')
  } catch (error) {
    throw new NoteExportOperationError(
      'write',
      `No se pudo escribir el archivo: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return { saved: true, filePath: result.filePath }
}
