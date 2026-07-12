// @vitest-environment node
/**
 * SPEC-033: tests de src/main/scriptAutoGenerationService.ts con el SDK de
 * Anthropic mockeado (arnés de SPEC-014: clases de error espejo para
 * instanceof) y store/repository REALES sobre un directorio temporal, patrón
 * objectiveEvaluationService (SPEC-025). El mock de electron añade
 * BrowserWindow.getAllWindows con webContents capturando los eventos
 * `llm:script-generation` del disparo automático. La generación NO se mockea:
 * corre el generateInterviewScript real de llmService (reutilización íntegra,
 * Notas técnicas de la spec) con la llamada al SDK interceptada.
 * La clave llega por ANTHROPIC_API_KEY (fallback de entorno del servicio).
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoGenerateInterviewScript } from '../../../src/main/scriptAutoGenerationService'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import type { Interview } from '../../../src/renderer/src/types/domain'
import type { ScriptGenerationEvent } from '../../../src/renderer/src/types/llm'

const harness = vi.hoisted(() => {
  /** Jerarquía espejo de la del SDK: instanceof debe funcionar en mapSdkError. */
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  return {
    create: vi.fn(),
    /** Eventos enviados por main a las ventanas (canal + payload). */
    sent: [] as Array<{ channel: string; payload: ScriptGenerationEvent }>,
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
  safeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (plain: string): Buffer => Buffer.from(plain, 'utf8'),
    decryptString: (blob: Buffer): string => blob.toString('utf8')
  },
  BrowserWindow: {
    getAllWindows: (): Array<{
      webContents: {
        isDestroyed: () => boolean
        send: (channel: string, payload: ScriptGenerationEvent) => void
      }
    }> => [
      {
        webContents: {
          isDestroyed: (): boolean => false,
          send: (channel: string, payload: ScriptGenerationEvent): void => {
            harness.sent.push({ channel, payload })
          }
        }
      }
    ]
  }
}))

/** Respuesta del SDK con bloque thinking + text y usage medible (SPEC-021). */
function sdkResponse(text: string, stopReason = 'end_turn'): unknown {
  return {
    stop_reason: stopReason,
    usage: { input_tokens: 1000, output_tokens: 200 },
    content: [
      { type: 'thinking', thinking: 'razonamiento interno' },
      { type: 'text', text }
    ]
  }
}

const VALID_JSON = JSON.stringify({
  scriptMarkdown: '# Guión adaptado\n\n## Bloque 1\nPregunta adaptada al prospecto',
  objectives: ['Objetivo uno', 'Objetivo dos']
})

let dataDir = ''

/**
 * Captura recién creada (capture-first, SPEC-020): discovery + template de
 * SPEC-014 + entrevista SIN empresa y con template asignado (salvo overrides).
 */
function seedCapture(overrides: { withTemplate?: boolean } = {}): Interview {
  const { withTemplate = true } = overrides
  const discovery = repository.createDiscovery({ name: 'Discovery Maurya' })
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
  return repository.createInterview({
    discoveryId: discovery.id,
    companyId: null,
    title: 'Kickoff con prospecto',
    templateId: withTemplate ? template.id : null
  })
}

/** Espera a que el camino fire-and-forget emita `count` eventos. */
async function waitForEvents(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(harness.sent.length).toBeGreaterThanOrEqual(count)
  })
}

/** Deja correr los microtasks pendientes del camino silencioso. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.sent.length = 0
  dataDir = mkdtempSync(join(tmpdir(), 'maurya-auto-script-'))
  initStore(dataDir)
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key'
})

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY']
})

describe('scriptAutoGenerationService', () => {
  describe('silent guards', () => {
    // SPEC-033 · Notas técnicas (guards silenciosos): entrevista inexistente
    it('launches nothing and emits no events for a nonexistent interview', async () => {
      autoGenerateInterviewScript('missing-id')
      await flush()

      expect(harness.create).not.toHaveBeenCalled()
      expect(harness.sent).toHaveLength(0)
    })

    // SPEC-033 · AC-04 (lado main): sin template → cero llamadas, cero eventos
    it('launches nothing and emits no events when the capture has no template', async () => {
      const capture = seedCapture({ withTemplate: false })

      autoGenerateInterviewScript(capture.id)
      await flush()

      expect(harness.create).not.toHaveBeenCalled()
      expect(harness.sent).toHaveLength(0)
    })

    // SPEC-033 · AC-05 (lado main): sin clave de Anthropic → sin llamada al LLM
    it('launches nothing and emits no events when no Anthropic key is resolvable', async () => {
      const capture = seedCapture()
      delete process.env['ANTHROPIC_API_KEY']

      autoGenerateInterviewScript(capture.id)
      await flush()

      expect(harness.create).not.toHaveBeenCalled()
      expect(harness.sent).toHaveLength(0)
    })

    // SPEC-033 · AC-06: con guión presente el disparo repetido no relanza nada
    // y el guión existente jamás se sobrescribe
    it('launches nothing and never overwrites when the capture already has a script', async () => {
      const capture = seedCapture()
      repository.updateInterview(capture.id, {
        scriptMarkdown: '# Guión ya existente',
        objectives: ['Objetivo previo'],
        status: 'prepared'
      })

      autoGenerateInterviewScript(capture.id)
      await flush()

      expect(harness.create).not.toHaveBeenCalled()
      expect(harness.sent).toHaveLength(0)
      const persisted = repository.getInterview(capture.id)
      expect(persisted.scriptMarkdown).toBe('# Guión ya existente')
      expect(persisted.objectives).toEqual(['Objetivo previo'])
    })
  })

  describe('automatic generation', () => {
    // SPEC-033 · AC-01 (lado main) + AC-02 (origen del indicador) + AC-03
    // (persistencia + coste) + AC-08 (el guión queda persistido aunque el
    // usuario no esté mirando: los eventos van a las ventanas, el dato al store)
    it('returns synchronously, emits generating/done and persists script, objectives and aiUsage via the real generateInterviewScript', async () => {
      const capture = seedCapture()
      let resolveCall!: (value: unknown) => void
      harness.create.mockReturnValue(
        new Promise((resolve) => {
          resolveCall = resolve
        })
      )

      // Fire-and-forget: retorna void de inmediato aunque la llamada siga en vuelo
      expect(autoGenerateInterviewScript(capture.id)).toBeUndefined()

      await waitForEvents(1)
      expect(harness.sent[0]).toEqual({
        channel: 'llm:script-generation',
        payload: { interviewId: capture.id, status: 'generating' }
      })
      expect(harness.sent).toHaveLength(1)

      resolveCall(sdkResponse(VALID_JSON))
      await waitForEvents(2)
      const done = harness.sent[1].payload
      expect(done.status).toBe('done')
      if (done.status === 'done') {
        expect(done.interview.scriptMarkdown).toBe(
          '# Guión adaptado\n\n## Bloque 1\nPregunta adaptada al prospecto'
        )
        expect(done.interview.objectives).toEqual(['Objetivo uno', 'Objetivo dos'])
        expect(done.interview.status).toBe('prepared')
        // AC-03: el coste de la llamada queda acumulado en el aiUsage (SPEC-021)
        expect(done.interview.aiUsage).toMatchObject({
          calls: 1,
          inputTokens: 1000,
          outputTokens: 200
        })
      }
      // Reutilización íntegra de SPEC-014: el prompt real lleva el template
      const request = harness.create.mock.calls[0][0] as {
        messages: Array<{ content: string }>
      }
      expect(request.messages[0].content).toContain('Template: Entrevista de problema')
      expect(request.messages[0].content).toContain('¿Quién lleva el regulatorio?')
      // AC-08: persistido en el store con independencia de quién escuche
      const persisted = repository.getInterview(capture.id)
      expect(persisted.scriptMarkdown).toBe(
        '# Guión adaptado\n\n## Bloque 1\nPregunta adaptada al prospecto'
      )
    })

    // SPEC-033 · AC-07 (lado main): fallo → captura intacta sin guión y evento
    // error con el message de toLlmError
    it('keeps the capture untouched and emits the error event with the toLlmError message when the generation fails', async () => {
      const capture = seedCapture()
      harness.create.mockRejectedValue(new harness.errors.AuthenticationError('bad key'))

      autoGenerateInterviewScript(capture.id)

      await waitForEvents(2)
      expect(harness.sent[1]).toEqual({
        channel: 'llm:script-generation',
        payload: {
          interviewId: capture.id,
          status: 'error',
          message: 'La clave de Anthropic no es válida. Revísala en Ajustes.'
        }
      })
      const persisted = repository.getInterview(capture.id)
      expect(persisted.scriptMarkdown).toBeNull()
      expect(persisted.objectives).toEqual([])
      expect(persisted.status).toBe('draft')
    })

    // SPEC-033 · AC-06 (idempotencia in-flight, Notas técnicas): un segundo
    // disparo durante la generación es silencioso — ni eventos duplicados ni
    // segunda llamada al LLM
    it('ignores a duplicated trigger while a generation is in flight without duplicated events or calls', async () => {
      const capture = seedCapture()
      let resolveCall!: (value: unknown) => void
      harness.create.mockReturnValue(
        new Promise((resolve) => {
          resolveCall = resolve
        })
      )

      autoGenerateInterviewScript(capture.id)
      await waitForEvents(1)

      // Doble invocación (p. ej. disparo duplicado del renderer)
      autoGenerateInterviewScript(capture.id)
      await flush()
      expect(harness.sent).toHaveLength(1)
      expect(harness.create).toHaveBeenCalledTimes(1)

      resolveCall(sdkResponse(VALID_JSON))
      await waitForEvents(2)
      // Exactamente un generating y un done: nada duplicado
      expect(harness.sent).toHaveLength(2)
      expect(harness.sent.map((entry) => entry.payload.status)).toEqual(['generating', 'done'])
    })
  })
})
