// @vitest-environment node
/**
 * Tests de src/main/assistantService.ts (SPEC-016) con el SDK de Anthropic
 * mockeado (clases de error espejo, patrón SPEC-014), store/repository y
 * transcriptionService REALES (las líneas finales se inyectan por la vía
 * pública: la conexión Deepgram mockeada → handleResult → finalLineListener).
 * Tiempo: vi.useFakeTimers({toFake:['Date']}) — solo Date, para gobernar el
 * intervalo mínimo sin romper promesas ni timers reales (lección fake timers).
 */
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MIN_INTERVAL_MS,
  MIN_NEW_FINAL_LINES,
  startAssistant,
  stopAssistant
} from '../../../src/main/assistantService'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import type { DeepgramCallbacks } from '../../../src/main/deepgramService'
import {
  persistTranscript,
  resetTranscription,
  startTranscription
} from '../../../src/main/transcriptionService'
import type {
  AssistantSessionSummary,
  AssistantUpdateEvent
} from '../../../src/renderer/src/types/assistant'

const harness = vi.hoisted(() => {
  /** Jerarquía espejo de la del SDK: instanceof debe funcionar en mapSdkError. */
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  return {
    create: vi.fn(),
    dgInstances: [] as unknown[],
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

vi.mock('../../../src/main/deepgramService', () => ({
  DeepgramConnection: class {
    apiKey: string
    callbacks: DeepgramCallbacks
    opened = false
    isOpen = false
    sendAudio = vi.fn(() => true)
    sendKeepAlive = vi.fn()
    closeStream = vi.fn()
    terminate = vi.fn()

    constructor(apiKey: string, callbacks: DeepgramCallbacks) {
      this.apiKey = apiKey
      this.callbacks = callbacks
      harness.dgInstances.push(this)
    }
  },
  classifyConnectionFailure: vi.fn(() => Promise.resolve('other' as const))
}))

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

interface FakeConnection {
  callbacks: DeepgramCallbacks
  opened: boolean
  isOpen: boolean
}

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

function analysisPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: 'continue',
    suggestedQuestion: '¿Cuándo fue la última vez que pasó?',
    reason: 'Ya hay material concreto para avanzar',
    alarms: [],
    objectivesMet: [],
    ...overrides
  }
}

function createSender(): { sender: WebContents; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn()
  const senderLike = {
    isDestroyed: (): boolean => false,
    send
  }
  return { sender: senderLike as unknown as WebContents, send }
}

function assistantEvents(send: ReturnType<typeof vi.fn>): AssistantUpdateEvent[] {
  return send.mock.calls
    .filter((call) => call[0] === 'assistant:update')
    .map((call) => call[1] as AssistantUpdateEvent)
}

const BASE_TIME_MS = 1_000_000_000

let send: ReturnType<typeof vi.fn>
let connection: FakeConnection
let interviewId = ''
let lineCounter = 0

/** Inyecta una línea final por la vía pública (transcripción real mockeada). */
function feedFinal(text?: string): void {
  lineCounter += 1
  connection.callbacks.onResult({
    channelIndex: lineCounter % 2,
    transcript: text ?? `Línea de conversación ${lineCounter}`,
    isFinal: true,
    startSeconds: lineCounter,
    durationSeconds: 1,
    speaker: 0
  })
}

async function waitForCreateCalls(count: number): Promise<void> {
  await vi.waitFor(() => expect(harness.create).toHaveBeenCalledTimes(count))
}

/** Espera a que el último evento sea 'active' (la promesa del análisis resolvió). */
async function waitForActive(): Promise<void> {
  await vi.waitFor(() => {
    const events = assistantEvents(send)
    expect(events.at(-1)?.state).toBe('active')
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.dgInstances.length = 0
  lineCounter = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(BASE_TIME_MS)
  initStore(mkdtempSync(join(tmpdir(), 'maurya-assistant-')))
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
  process.env['DEEPGRAM_API_KEY'] = 'dg-test'

  // Entrevista con objetivos y guión (contexto recomendado). SPEC-020 AC-16:
  // la sesión corre sobre una CAPTURA SIN EMPRESA (companyId null) — el
  // asistente se activa solo por interviewId y toda la suite debe funcionar
  // igual sin empresa asignada (la ausencia de empresa no lo inhibe).
  const discovery = repository.createDiscovery({ name: 'Discovery Maurya' })
  const interview = repository.createInterview({
    discoveryId: discovery.id,
    title: 'Entrevista'
  })
  repository.updateInterview(interview.id, {
    objectives: ['Objetivo cero', 'Objetivo uno', 'Objetivo dos'],
    scriptMarkdown: '# Guión de la entrevista'
  })
  interviewId = interview.id

  // Sesión de transcripción real (conexión mockeada) para inyectar finales
  const transcriptionSender = createSender()
  startTranscription(transcriptionSender.sender)
  connection = harness.dgInstances[0] as FakeConnection
  connection.opened = true
  connection.isOpen = true
  connection.callbacks.onOpen()

  const assistantSender = createSender()
  send = assistantSender.send
  startAssistant(assistantSender.sender, interviewId)
})

afterEach(() => {
  stopAssistant()
  resetTranscription()
  vi.useRealTimers()
  delete process.env['ANTHROPIC_API_KEY']
  delete process.env['DEEPGRAM_API_KEY']
})

describe('assistantService', () => {
  describe('proactive triggering', () => {
    // SPEC-016 · AC-01 + AC-13 (material mínimo)
    it('does not call with fewer than MIN_NEW_FINAL_LINES and analyzes proactively on the third final line', async () => {
      // Contrato de coste de la spec: 3 líneas / 20 s (constantes exportadas)
      expect(MIN_NEW_FINAL_LINES).toBe(3)
      expect(MIN_INTERVAL_MS).toBe(20000)
      harness.create.mockResolvedValue(sdkResponse(analysisPayload()))

      feedFinal()
      feedFinal()
      expect(harness.create).not.toHaveBeenCalled()

      feedFinal()
      await waitForCreateCalls(1)
      await waitForActive()

      const events = assistantEvents(send)
      // SPEC-036: todo evento transporta la cola completa (sustituye a suggestion)
      expect(events[0]).toEqual({
        state: 'idle',
        queue: { pending: [], pinned: [] },
        objectivesMet: []
      })
      expect(events.at(-2)?.state).toBe('analyzing')
      const active = events.at(-1)
      expect(active?.queue.pending).toHaveLength(1)
      expect(active?.queue.pending[0]).toMatchObject({
        action: 'continue',
        suggestedQuestion: '¿Cuándo fue la última vez que pasó?',
        reason: 'Ya hay material concreto para avanzar',
        alarms: []
      })
    })

    // SPEC-016 · AC-13 (intervalo mínimo entre llamadas)
    it('does not call again before MIN_INTERVAL_MS even with enough new lines, and does after it', async () => {
      harness.create.mockResolvedValue(sdkResponse(analysisPayload()))
      feedFinal()
      feedFinal()
      feedFinal()
      await waitForCreateCalls(1)
      await waitForActive()

      // Material de sobra pero dentro de la ventana: sin segunda llamada
      feedFinal()
      feedFinal()
      feedFinal()
      expect(harness.create).toHaveBeenCalledTimes(1)

      // Pasada la ventana, la siguiente línea dispara el segundo análisis
      vi.setSystemTime(BASE_TIME_MS + MIN_INTERVAL_MS + 1000)
      feedFinal()
      await waitForCreateCalls(2)
    })

    // SPEC-016 · AC-13 (guard in-flight: nunca dos llamadas simultáneas)
    it('never runs two analyses at once: new lines during an in-flight call do not trigger another', async () => {
      harness.create.mockReturnValue(new Promise(() => undefined))
      feedFinal()
      feedFinal()
      feedFinal()
      await waitForCreateCalls(1)

      vi.setSystemTime(BASE_TIME_MS + MIN_INTERVAL_MS * 2)
      feedFinal()
      feedFinal()
      feedFinal()
      expect(harness.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('without an Anthropic key', () => {
    // SPEC-016 · AC-03 (servicio)
    it('emits no-key and stays inert: zero calls and stop returns null', async () => {
      stopAssistant()
      send.mockClear()
      delete process.env['ANTHROPIC_API_KEY']

      const { sender, send: noKeySend } = createSender()
      startAssistant(sender, interviewId)

      expect(assistantEvents(noKeySend)).toEqual([
        { state: 'no-key', queue: { pending: [], pinned: [] }, objectivesMet: [] }
      ])
      feedFinal()
      feedFinal()
      feedFinal()
      expect(harness.create).not.toHaveBeenCalled()
      expect(stopAssistant()).toBeNull()
    })
  })

  describe('objectives tracking', () => {
    // SPEC-016 · AC-09 (servicio: acumulativo y filtrado de índices)
    it('accumulates objectivesMet across analyses filtering out-of-range indices', async () => {
      // Primer análisis: cubre el 0 y devuelve un índice fuera de rango (5)
      harness.create.mockResolvedValueOnce(sdkResponse(analysisPayload({ objectivesMet: [0, 5] })))
      feedFinal()
      feedFinal()
      feedFinal()
      await waitForCreateCalls(1)
      await waitForActive()
      expect(assistantEvents(send).at(-1)?.objectivesMet).toEqual([0])

      // Segundo análisis: cubre el 1 → el set solo crece (0 no vuelve a pendiente)
      harness.create.mockResolvedValueOnce(sdkResponse(analysisPayload({ objectivesMet: [1] })))
      vi.setSystemTime(BASE_TIME_MS + MIN_INTERVAL_MS + 1000)
      feedFinal()
      feedFinal()
      feedFinal()
      await waitForCreateCalls(2)
      await vi.waitFor(() => {
        expect(assistantEvents(send).at(-1)?.objectivesMet).toEqual([0, 1])
      })
    })
  })

  describe('API errors', () => {
    // SPEC-016 · AC-14 (servicio: error tipado, contadores intactos, reintento)
    it('emits a typed error keeping the counters so the next window retries', async () => {
      harness.create.mockRejectedValueOnce(
        new harness.errors.AuthenticationError('401 invalid x-api-key')
      )
      feedFinal()
      feedFinal()
      feedFinal()
      await waitForCreateCalls(1)
      await vi.waitFor(() => {
        expect(assistantEvents(send).at(-1)?.state).toBe('error')
      })
      expect(assistantEvents(send).at(-1)?.error?.kind).toBe('auth')

      // Los contadores NO se resetean: pasada la ventana, una línea más reintenta
      harness.create.mockResolvedValueOnce(sdkResponse(analysisPayload()))
      vi.setSystemTime(BASE_TIME_MS + MIN_INTERVAL_MS + 1000)
      feedFinal()
      await waitForCreateCalls(2)
      await waitForActive()
    })
  })

  describe('session summary persistence', () => {
    // SPEC-016 · AC-11/AC-12 adaptados: SPEC-036 deroga el feedback 👍/👎
    // (sendAssistantFeedback eliminado; el summary pierde los contadores) y
    // suggestionCount pasa a contar candidatas ACEPTADAS en cola — por eso la
    // segunda sugerencia debe ser distinta (una idéntica se suprimiría).
    it('persists the session summary without feedback counters in the transcript', async () => {
      harness.create.mockResolvedValueOnce(sdkResponse(analysisPayload()))
      feedFinal()
      feedFinal()
      feedFinal()
      await waitForCreateCalls(1)
      await waitForActive()

      // Segunda sugerencia (distinta: las casi-duplicadas se suprimen, SPEC-036)
      harness.create.mockResolvedValueOnce(
        sdkResponse(analysisPayload({ suggestedQuestion: '¿Quién más participó?' }))
      )
      vi.setSystemTime(BASE_TIME_MS + MIN_INTERVAL_MS + 1000)
      feedFinal()
      feedFinal()
      feedFinal()
      await waitForCreateCalls(2)
      await vi.waitFor(() => {
        expect(assistantEvents(send).filter((event) => event.state === 'active')).toHaveLength(2)
      })

      const summary = stopAssistant()
      // SPEC-021: el summary gana el usage de la sesión (las respuestas del
      // SDK mockeado no traen bloque usage → 2 llamadas con 0 tokens).
      // SPEC-036: sin contadores de feedback (toEqual fija su ausencia).
      // SPEC-039: el summary gana questionOutcomes (vacío sin acciones manuales).
      expect(summary).toEqual({
        suggestionCount: 2,
        questionOutcomes: [],
        usage: { calls: 2, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }
      })

      // AC-12 (vigente en lo no derogado): el transcript.json persiste el
      // registro de la sesión — nº de sugerencias + uso de IA, sin feedback
      const dir = mkdtempSync(join(tmpdir(), 'maurya-assistant-transcript-'))
      const { transcriptPath } = persistTranscript(join(dir, 'entrevista.wav'), summary)
      if (transcriptPath === null) {
        throw new Error('persistTranscript devolvió null con líneas finales recibidas')
      }
      const persisted = JSON.parse(readFileSync(transcriptPath, 'utf8')) as {
        assistant: AssistantSessionSummary | null
      }
      expect(persisted.assistant).toEqual({
        suggestionCount: 2,
        questionOutcomes: [],
        usage: { calls: 2, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }
      })
      expect(persisted.assistant).not.toHaveProperty('feedback')
    })
  })

  describe('stop', () => {
    // SPEC-016 · AC-15 (servicio: desactivación limpia y respuesta tardía descartada)
    it('detaches the listener and discards late in-flight responses after stop', async () => {
      let resolveAnalysis!: (value: unknown) => void
      harness.create.mockReturnValue(
        new Promise((resolve) => {
          resolveAnalysis = resolve
        })
      )
      feedFinal()
      feedFinal()
      feedFinal()
      await waitForCreateCalls(1)

      const summary = stopAssistant()
      // SPEC-021: sin análisis completados el usage viaja a ceros
      // (SPEC-036 deroga los contadores de feedback; SPEC-039 añade questionOutcomes)
      expect(summary).toEqual({
        suggestionCount: 0,
        questionOutcomes: [],
        usage: { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }
      })
      const eventsAtStop = assistantEvents(send).length

      // Nuevas líneas tras el stop: el listener se retiró → cero llamadas nuevas
      vi.setSystemTime(BASE_TIME_MS + MIN_INTERVAL_MS * 3)
      feedFinal()
      feedFinal()
      feedFinal()
      expect(harness.create).toHaveBeenCalledTimes(1)

      // La respuesta tardía se descarta (session !== target): sin eventos nuevos
      resolveAnalysis(sdkResponse(analysisPayload()))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(assistantEvents(send)).toHaveLength(eventsAtStop)
    })
  })
})
