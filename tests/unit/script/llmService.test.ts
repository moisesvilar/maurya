// @vitest-environment node
/**
 * Tests de src/main/llmService.ts (SPEC-014) con el SDK de Anthropic mockeado
 * (vi.mock('@anthropic-ai/sdk') con clases de error reales para instanceof) y
 * el store/repository REALES sobre un directorio temporal (patrón SPEC-006).
 * La clave llega por ANTHROPIC_API_KEY (fallback de entorno del servicio).
 */
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateInterviewScript, LlmOperationError } from '../../../src/main/llmService'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import type { Interview, InterviewTemplate } from '../../../src/renderer/src/types/domain'
import type { LlmErrorKind } from '../../../src/renderer/src/types/llm'

const harness = vi.hoisted(() => {
  /** Jerarquía espejo de la del SDK: instanceof debe funcionar en mapSdkError. */
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  return {
    create: vi.fn(),
    errors: { APIError, AuthenticationError, RateLimitError, APIConnectionError }
  }
})

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    static APIError = harness.errors.APIError
    static AuthenticationError = harness.errors.AuthenticationError
    static RateLimitError = harness.errors.RateLimitError
    static APIConnectionError = harness.errors.APIConnectionError
    // La clave no se inspecciona: el servicio la resuelve antes de construir
    // el cliente, así que el constructor por defecto basta.
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
  safeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (plain: string): Buffer => Buffer.from(plain, 'utf8'),
    decryptString: (blob: Buffer): string => blob.toString('utf8')
  }
}))

/** Respuesta del SDK con bloque thinking + bloque text (el JSON va en text). */
function sdkResponse(text: string, stopReason = 'end_turn'): unknown {
  return {
    stop_reason: stopReason,
    content: [
      { type: 'thinking', thinking: 'razonamiento interno' },
      { type: 'text', text }
    ]
  }
}

const VALID_JSON = JSON.stringify({
  scriptMarkdown: '# Guión adaptado\n\n## Bloque 1\nPregunta adaptada a Acme',
  objectives: ['Objetivo uno', '', '   ', 'Objetivo dos']
})

interface Seeded {
  interview: Interview
  template: InterviewTemplate
  companyId: string
  discoveryId: string
}

/** Discovery + empresa + contacto + template + entrevista con template asignado. */
function seedBase(options: { withTemplate?: boolean } = {}): Seeded {
  const { withTemplate = true } = options
  const discovery = repository.createDiscovery({ name: 'Discovery Maurya' })
  const company = repository.createCompany({
    name: 'Acme Corp',
    website: 'https://acme.example'
  })
  const contact = repository.createContact({
    companyId: company.id,
    name: 'Jane Doe',
    position: 'CTO'
  })
  const template = repository.createInterviewTemplate({
    name: 'Entrevista de problema',
    phase: 'problem',
    blocks: [
      {
        title: 'Contexto',
        guidance: 'Romper el hielo',
        questions: [{ text: '¿Quién lleva el regulatorio?', guidance: 'Buscar rol' }]
      }
    ]
  })
  const interview = repository.createInterview({
    discoveryId: discovery.id,
    companyId: company.id,
    title: 'Discovery con Acme',
    // SPEC-043: N contactos por entrevista — el servicio usa el primero
    contactIds: [contact.id],
    templateId: withTemplate ? template.id : null
  })
  return { interview, template, companyId: company.id, discoveryId: discovery.id }
}

async function captureLlmError(promise: Promise<unknown>): Promise<LlmOperationError> {
  const caught = await promise.then(
    () => null,
    (error: unknown) => error
  )
  expect(caught).toBeInstanceOf(LlmOperationError)
  return caught as LlmOperationError
}

let dataDir = ''

beforeEach(() => {
  vi.clearAllMocks()
  dataDir = mkdtempSync(join(tmpdir(), 'maurya-llm-'))
  initStore(dataDir)
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key'
})

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY']
})

describe('llmService', () => {
  describe('when the generation succeeds', () => {
    // SPEC-014 · AC-01 (servicio)
    it('persists scriptMarkdown, filtered objectives and status prepared, returning the updated interview', async () => {
      const { interview } = seedBase()
      harness.create.mockResolvedValue(sdkResponse(VALID_JSON))

      const updated = await generateInterviewScript(interview.id)

      expect(updated.scriptMarkdown).toBe(
        '# Guión adaptado\n\n## Bloque 1\nPregunta adaptada a Acme'
      )
      // Los objetivos vacíos o de solo espacios se descartan
      expect(updated.objectives).toEqual(['Objetivo uno', 'Objetivo dos'])
      expect(updated.status).toBe('prepared')
      // Persistencia real en el store
      const persisted = repository.getInterview(interview.id)
      expect(persisted.status).toBe('prepared')
      expect(persisted.scriptMarkdown).toBe(updated.scriptMarkdown)
      // Parámetros clave del SDK (modelo fijo + structured outputs, sin sampling)
      const params = harness.create.mock.calls[0][0] as Record<string, unknown>
      expect(params.model).toBe('claude-opus-4-8')
      expect(params.max_tokens).toBe(16000)
      expect(params).not.toHaveProperty('temperature')
      expect(params.output_config).toEqual({
        format: {
          type: 'json_schema',
          schema: expect.objectContaining({ required: ['scriptMarkdown', 'objectives'] })
        }
      })
    })
  })

  describe('prerequisites', () => {
    // SPEC-014 · AC-02 (servicio)
    it('fails with no-template without calling the SDK when the interview has no template', async () => {
      const { interview } = seedBase({ withTemplate: false })

      const error = await captureLlmError(generateInterviewScript(interview.id))

      expect(error.kind).toBe('no-template')
      expect(error.message).toBe('Asigna un template para generar el guión')
      expect(harness.create).not.toHaveBeenCalled()
    })

    // SPEC-014 · AC-03 (servicio)
    it('fails with no-key without calling the SDK when no Anthropic key is resolvable', async () => {
      const { interview } = seedBase()
      delete process.env['ANTHROPIC_API_KEY']

      const error = await captureLlmError(generateInterviewScript(interview.id))

      expect(error.kind).toBe('no-key')
      expect(error.message).toBe('Configura tu clave de Anthropic en Ajustes para generar el guión')
      expect(harness.create).not.toHaveBeenCalled()
    })
  })

  describe('historical context', () => {
    // SPEC-014 · AC-04
    it('injects previous same-company transcripts and notes into the user prompt, omitting other companies and corrupt transcripts', async () => {
      const { interview, template, companyId, discoveryId } = seedBase()

      // Entrevista previa de la MISMA empresa con transcript legible
      const transcriptDir = mkdtempSync(join(tmpdir(), 'maurya-llm-transcripts-'))
      const transcriptPath = join(transcriptDir, 'previa.transcript.json')
      writeFileSync(
        transcriptPath,
        JSON.stringify({
          lines: [
            {
              channel: 'mic',
              speaker: 0,
              text: 'Ya validamos el problema del registro manual',
              startMs: 0,
              endMs: 1000,
              receivedAtMs: 1100
            }
          ],
          latency: null
        })
      )
      const previousWithTranscript = repository.createInterview({
        discoveryId,
        companyId,
        title: 'Primera toma de contacto',
        templateId: template.id
      })
      repository.updateInterview(previousWithTranscript.id, { transcriptPath })

      // Entrevista previa de la MISMA empresa con nota
      const previousWithNote = repository.createInterview({
        discoveryId,
        companyId,
        title: 'Sesión de seguimiento'
      })
      repository.createNote({
        interviewId: previousWithNote.id,
        contentMarkdown: 'El CTO gestiona el regulatorio con hojas de cálculo'
      })

      // Entrevista previa de la misma empresa con transcript CORRUPTO (sin nota):
      // se omite sin lanzar
      const corruptPath = join(transcriptDir, 'corrupto.transcript.json')
      writeFileSync(corruptPath, '{esto no es json')
      const previousCorrupt = repository.createInterview({
        discoveryId,
        companyId,
        title: 'Sesión con transcript corrupto'
      })
      repository.updateInterview(previousCorrupt.id, { transcriptPath: corruptPath })

      // Entrevista de OTRA empresa con nota: NO debe entrar en el contexto
      const otherDiscovery = repository.createDiscovery({ name: 'Otro discovery' })
      const otherCompany = repository.createCompany({
        name: 'Globex'
      })
      const otherInterview = repository.createInterview({
        discoveryId: otherDiscovery.id,
        companyId: otherCompany.id,
        title: 'Entrevista ajena'
      })
      repository.createNote({
        interviewId: otherInterview.id,
        contentMarkdown: 'Material de otra empresa'
      })

      harness.create.mockResolvedValue(sdkResponse(VALID_JSON))
      await generateInterviewScript(interview.id)

      const params = harness.create.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>
      }
      const userPrompt = params.messages[0].content
      expect(userPrompt).toContain('## Entrevistas anteriores')
      // Transcript aplanado "[canal] texto"
      expect(userPrompt).toContain('[mic s0] Ya validamos el problema del registro manual')
      // Nota de la misma empresa
      expect(userPrompt).toContain('El CTO gestiona el regulatorio con hojas de cálculo')
      // La otra empresa queda fuera
      expect(userPrompt).not.toContain('Material de otra empresa')
      // El transcript corrupto no aporta material y no rompe la generación
      expect(userPrompt).not.toContain('Sesión con transcript corrupto')
    })
  })

  describe('SDK and format errors', () => {
    // SPEC-014 · AC-06 (servicio)
    it('maps SDK errors to typed kinds and leaves the interview untouched in every case', async () => {
      const { interview } = seedBase()

      const cases: Array<[unknown, LlmErrorKind]> = [
        [new harness.errors.AuthenticationError('401 invalid x-api-key'), 'auth'],
        [new harness.errors.RateLimitError('429 rate limited'), 'rate-limit'],
        [new harness.errors.APIConnectionError('connection refused'), 'connection']
      ]
      for (const [sdkError, expectedKind] of cases) {
        harness.create.mockRejectedValueOnce(sdkError)
        const error = await captureLlmError(generateInterviewScript(interview.id))
        expect(error.kind).toBe(expectedKind)
      }

      // Respuesta con JSON inválido → format
      harness.create.mockResolvedValueOnce(sdkResponse('esto no es JSON'))
      const formatError = await captureLlmError(generateInterviewScript(interview.id))
      expect(formatError.kind).toBe('format')

      // En TODOS los casos la entrevista queda intacta (releída del store)
      const persisted = repository.getInterview(interview.id)
      expect(persisted.scriptMarkdown).toBeNull()
      expect(persisted.objectives).toEqual([])
      expect(persisted.status).toBe('draft')
    })
  })
})
