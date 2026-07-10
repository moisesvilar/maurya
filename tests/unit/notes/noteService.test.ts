// @vitest-environment node
/**
 * Tests de src/main/noteService.ts (SPEC-017) con el SDK de Anthropic mockeado
 * (clases de error espejo, patrón SPEC-014/016), el dialog de electron
 * mockeado y store/repository REALES sobre un directorio temporal. La clave
 * llega por ANTHROPIC_API_KEY (fallback de entorno del servicio).
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import { LlmOperationError } from '../../../src/main/llmService'
import {
  exportInterviewDocument,
  generateInterviewNote,
  NoteExportOperationError,
  readTranscriptLines
} from '../../../src/main/noteService'
import type { Interview, NoteTemplate } from '../../../src/renderer/src/types/domain'

const harness = vi.hoisted(() => {
  /** Jerarquía espejo de la del SDK: instanceof debe funcionar en mapSdkError. */
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  return {
    create: vi.fn(),
    showSaveDialog: vi.fn(),
    errors: { APIError, AuthenticationError, RateLimitError, APIConnectionError }
  }
})

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    static APIError = harness.errors.APIError
    static AuthenticationError = harness.errors.AuthenticationError
    static RateLimitError = harness.errors.RateLimitError
    static APIConnectionError = harness.errors.APIConnectionError
    readonly messages = { create: harness.create }
  }
  return { default: MockAnthropic }
})

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  },
  dialog: {
    showSaveDialog: harness.showSaveDialog
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (plain: string): Buffer => Buffer.from(plain, 'utf8'),
    decryptString: (blob: Buffer): string => blob.toString('utf8')
  }
}))

/** Respuesta del SDK con bloque thinking + bloque text (el JSON va en text). */
function sdkResponse(payload: Record<string, unknown>): unknown {
  return {
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: 'razonamiento' },
      { type: 'text', text: JSON.stringify(payload) }
    ]
  }
}

const GENERATED_SECTIONS = {
  sections: [
    { title: 'lo que diga la IA se ignora', contentMarkdown: 'El CTO gestiona todo a mano.' },
    { title: 'da igual', contentMarkdown: '«Nos lleva dos días cada registro»' }
  ]
}

interface Seeded {
  interview: Interview
  template: NoteTemplate
  transcriptPath: string
}

let dataDir = ''

function writeTranscriptFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'maurya-note-transcript-'))
  const transcriptPath = join(dir, 'entrevista.transcript.json')
  writeFileSync(
    transcriptPath,
    JSON.stringify({
      lines: [
        {
          channel: 'mic',
          speaker: 0,
          text: '¿Cómo gestionáis hoy el registro?',
          startMs: 0,
          endMs: 1000,
          receivedAtMs: 1100
        },
        {
          channel: 'system',
          speaker: 1,
          text: 'Todo a mano, nos lleva dos días.',
          startMs: 1000,
          endMs: 2000,
          receivedAtMs: 2100
        }
      ],
      latency: null,
      assistant: null
    })
  )
  return transcriptPath
}

function seedBase(options: { withTranscript?: boolean } = {}): Seeded {
  const { withTranscript = true } = options
  const discovery = repository.createDiscovery({ name: 'Discovery Maurya' })
  const company = repository.createCompany({ discoveryId: discovery.id, name: 'Acme Corp' })
  repository.createContact({ companyId: company.id, name: 'Jane Doe', position: 'CTO' })
  const template = repository.createNoteTemplate({
    name: 'Notas discovery',
    context: 'Céntrate en dolores y evidencias.',
    sections: [
      { title: 'Dolores', description: 'Problemas detectados' },
      { title: 'Citas', description: 'Frases literales relevantes' }
    ]
  })
  const interview = repository.createInterview({
    discoveryId: discovery.id,
    companyId: company.id,
    title: 'Discovery con Acme'
  })
  const transcriptPath = withTranscript ? writeTranscriptFile() : ''
  if (withTranscript) {
    repository.updateInterview(interview.id, { transcriptPath, status: 'recorded' })
  }
  return { interview: repository.getInterview(interview.id), template, transcriptPath }
}

async function captureLlmError(promise: Promise<unknown>): Promise<LlmOperationError> {
  const caught = await promise.then(
    () => null,
    (error: unknown) => error
  )
  expect(caught).toBeInstanceOf(LlmOperationError)
  return caught as LlmOperationError
}

async function captureExportError(promise: Promise<unknown>): Promise<NoteExportOperationError> {
  const caught = await promise.then(
    () => null,
    (error: unknown) => error
  )
  expect(caught).toBeInstanceOf(NoteExportOperationError)
  return caught as NoteExportOperationError
}

beforeEach(() => {
  vi.clearAllMocks()
  dataDir = mkdtempSync(join(tmpdir(), 'maurya-notes-'))
  initStore(dataDir)
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
})

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY']
})

describe('noteService', () => {
  describe('generation', () => {
    // SPEC-017 · AC-05 (servicio: heading por sección del template, en su orden)
    it('assembles the note with the template section titles in order and persists it with status summarized only after a valid parse', async () => {
      const { interview, template } = seedBase()
      harness.create.mockResolvedValue(sdkResponse(GENERATED_SECTIONS))

      const result = await generateInterviewNote(interview.id, template.id)

      // Los títulos del template son la fuente de verdad, en su orden
      expect(result.note.contentMarkdown).toBe(
        '## Dolores\n\nEl CTO gestiona todo a mano.\n\n## Citas\n\n«Nos lleva dos días cada registro»'
      )
      expect(result.interview.status).toBe('summarized')
      // Persistencia real
      expect(repository.getInterview(interview.id).status).toBe('summarized')
      expect(repository.getNoteByInterview(interview.id)?.contentMarkdown).toBe(
        result.note.contentMarkdown
      )
      // El prompt lleva las secciones numeradas y la conversación etiquetada
      const params = harness.create.mock.calls[0][0] as {
        messages: Array<{ content: string }>
        system: string
      }
      expect(params.messages[0].content).toContain('1. Dolores — Problemas detectados')
      expect(params.messages[0].content).toContain('[Tú] ¿Cómo gestionáis hoy el registro?')
      expect(params.messages[0].content).toContain('[Interlocutor 2] Todo a mano')
      expect(params.system).toContain('Céntrate en dolores y evidencias.')
    })

    // SPEC-017 · AC-09 (servicio: la regeneración sustituye la nota existente)
    it('updates the existing note in place when regenerating instead of creating a second one', async () => {
      const { interview, template } = seedBase()
      harness.create.mockResolvedValue(sdkResponse(GENERATED_SECTIONS))
      const first = await generateInterviewNote(interview.id, template.id)

      harness.create.mockResolvedValue(
        sdkResponse({
          sections: [
            { title: 'x', contentMarkdown: 'Contenido regenerado' },
            { title: 'y', contentMarkdown: 'Citas regeneradas' }
          ]
        })
      )
      const second = await generateInterviewNote(interview.id, template.id)

      expect(second.note.id).toBe(first.note.id)
      expect(second.note.contentMarkdown).toBe(
        '## Dolores\n\nContenido regenerado\n\n## Citas\n\nCitas regeneradas'
      )
      expect(repository.getNoteByInterview(interview.id)?.contentMarkdown).toBe(
        second.note.contentMarkdown
      )
    })

    // SPEC-017 · refuerzo de AC-02 + AC-04 (guards del servicio, sin llamar al SDK)
    it('fails typed with no-transcript and no-key guards without calling the SDK', async () => {
      const { interview, template } = seedBase({ withTranscript: false })

      const noTranscript = await captureLlmError(generateInterviewNote(interview.id, template.id))
      expect(noTranscript.kind).toBe('no-transcript')
      expect(noTranscript.message).toBe('Graba la entrevista para poder generar la nota.')

      const recorded = seedBase()
      delete process.env['ANTHROPIC_API_KEY']
      const noKey = await captureLlmError(
        generateInterviewNote(recorded.interview.id, recorded.template.id)
      )
      expect(noKey.kind).toBe('no-key')
      expect(noKey.message).toBe('Configura tu clave de Anthropic en Ajustes para generar la nota')
      expect(harness.create).not.toHaveBeenCalled()
    })

    // SPEC-017 · AC-10 (servicio: errores tipados y nada cambia, ni la nota previa)
    it('maps SDK and format errors leaving the interview and its previous note untouched', async () => {
      const { interview, template } = seedBase()
      harness.create.mockResolvedValue(sdkResponse(GENERATED_SECTIONS))
      const first = await generateInterviewNote(interview.id, template.id)

      // Error del SDK
      harness.create.mockRejectedValueOnce(
        new harness.errors.AuthenticationError('401 invalid x-api-key')
      )
      const authError = await captureLlmError(generateInterviewNote(interview.id, template.id))
      expect(authError.kind).toBe('auth')

      // Respuesta que no cubre todas las secciones del template → format
      harness.create.mockResolvedValueOnce(
        sdkResponse({ sections: [{ title: 'solo una', contentMarkdown: 'incompleta' }] })
      )
      const formatError = await captureLlmError(generateInterviewNote(interview.id, template.id))
      expect(formatError.kind).toBe('format')
      expect(formatError.message).toBe(
        'La respuesta de la IA no cubre todas las secciones del note-template. Vuelve a intentarlo.'
      )

      // La nota previa y el estado quedan intactos
      expect(repository.getNoteByInterview(interview.id)?.contentMarkdown).toBe(
        first.note.contentMarkdown
      )
      expect(repository.getInterview(interview.id).status).toBe('summarized')
    })
  })

  describe('transcript reading', () => {
    // SPEC-017 · AC-18 (servicio: archivo ilegible → error tipado sin lanzar)
    it('returns the typed unreadable result for corrupt files and parses valid ones with speaker fallback', () => {
      const dir = mkdtempSync(join(tmpdir(), 'maurya-notes-read-'))
      const corruptPath = join(dir, 'corrupto.transcript.json')
      writeFileSync(corruptPath, '{esto no es json')

      expect(readTranscriptLines(corruptPath)).toEqual({
        ok: false,
        kind: 'unreadable',
        message: 'No se pudo leer la transcripción'
      })
      expect(readTranscriptLines(join(dir, 'no-existe.json')).ok).toBe(false)

      // Archivo válido: parsea las líneas y degrada speaker ausente a null
      const validPath = join(dir, 'valido.transcript.json')
      writeFileSync(
        validPath,
        JSON.stringify({ lines: [{ channel: 'system', text: 'Hola' }], latency: null })
      )
      const result = readTranscriptLines(validPath)
      if (!result.ok) {
        throw new Error('El transcript válido debe leerse')
      }
      expect(result.lines).toHaveLength(1)
      expect(result.lines[0].speaker).toBeNull()
      expect(result.lines[0].channel).toBe('system')
    })
  })

  describe('export', () => {
    // SPEC-017 · AC-19 (servicio) + AC-21 (cancelar = resultado neutro)
    it('exports the note via the save dialog with the slugified default name, and cancelling writes nothing', async () => {
      const { interview, template } = seedBase()
      harness.create.mockResolvedValue(sdkResponse(GENERATED_SECTIONS))
      await generateInterviewNote(interview.id, template.id)

      // Confirmado: escribe el markdown de la nota en la ruta elegida
      const outDir = mkdtempSync(join(tmpdir(), 'maurya-notes-export-'))
      const outPath = join(outDir, 'salida.md')
      harness.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: outPath })

      const outcome = await exportInterviewDocument(null, interview.id, 'note')
      expect(outcome).toEqual({ saved: true, filePath: outPath })
      expect(readFileSync(outPath, 'utf-8')).toContain('## Dolores')
      // Nombre por defecto derivado del título, slugificado
      const options = harness.showSaveDialog.mock.calls[0][0] as { defaultPath: string }
      expect(options.defaultPath).toBe('discovery-con-acme-nota.md')

      // Cancelado: resultado neutro, sin archivo
      const cancelledPath = join(outDir, 'cancelada.md')
      harness.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined })
      const cancelled = await exportInterviewDocument(null, interview.id, 'note')
      expect(cancelled).toEqual({ saved: false, filePath: null })
      expect(existsSync(cancelledPath)).toBe(false)
    })

    // SPEC-017 · AC-20 (servicio: transcripción como Markdown con hablantes)
    it('exports the transcript as one markdown line per intervention with its speaker', async () => {
      const { interview } = seedBase()
      const outDir = mkdtempSync(join(tmpdir(), 'maurya-notes-export-transcript-'))
      const outPath = join(outDir, 'transcripcion.md')
      harness.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: outPath })

      const outcome = await exportInterviewDocument(null, interview.id, 'transcript')

      expect(outcome.saved).toBe(true)
      expect(readFileSync(outPath, 'utf-8')).toBe(
        '**Tú:** ¿Cómo gestionáis hoy el registro?\n**Interlocutor 2:** Todo a mano, nos lleva dos días.'
      )
      const options = harness.showSaveDialog.mock.calls[0][0] as { defaultPath: string }
      expect(options.defaultPath).toBe('discovery-con-acme-transcripcion.md')
    })

    // SPEC-017 · AC-22 (servicio: fallo de escritura → error tipado write)
    it('fails typed with kind write when the file cannot be written', async () => {
      const { interview, template } = seedBase()
      harness.create.mockResolvedValue(sdkResponse(GENERATED_SECTIONS))
      await generateInterviewNote(interview.id, template.id)

      harness.showSaveDialog.mockResolvedValueOnce({
        canceled: false,
        filePath: join(tmpdir(), 'directorio-que-no-existe-maurya', 'sub', 'salida.md')
      })
      const error = await captureExportError(exportInterviewDocument(null, interview.id, 'note'))
      expect(error.kind).toBe('write')
    })
  })
})
