// @vitest-environment node
/**
 * SPEC-025: tests de src/main/objectiveEvaluationService.ts con el SDK de
 * Anthropic mockeado (arnés de SPEC-014: clases de error espejo para
 * instanceof) y store/repository REALES sobre un directorio temporal. El mock
 * de electron añade BrowserWindow.getAllWindows con webContents capturando los
 * eventos `llm:objective-evaluation` que emite el camino automático.
 * La clave llega por ANTHROPIC_API_KEY (fallback de entorno del servicio).
 */
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  evaluateInterviewObjectives,
  maybeEvaluateAfterRecording
} from '../../../src/main/objectiveEvaluationService'
import { LlmOperationError } from '../../../src/main/llmService'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import type { Interview } from '../../../src/renderer/src/types/domain'
import type { ObjectiveEvaluationEvent } from '../../../src/renderer/src/types/llm'

const harness = vi.hoisted(() => {
  /** Jerarquía espejo de la del SDK: instanceof debe funcionar en mapSdkError. */
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  return {
    create: vi.fn(),
    /** Eventos enviados por main a las ventanas (canal + payload). */
    sent: [] as Array<{ channel: string; payload: ObjectiveEvaluationEvent }>,
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
  // noteService importa dialog en el top-level (readTranscriptLines vive ahí)
  dialog: {},
  BrowserWindow: {
    getAllWindows: (): Array<{
      webContents: {
        isDestroyed: () => boolean
        send: (channel: string, payload: ObjectiveEvaluationEvent) => void
      }
    }> => [
      {
        webContents: {
          isDestroyed: (): boolean => false,
          send: (channel: string, payload: ObjectiveEvaluationEvent): void => {
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
  evaluations: [
    { met: true, reason: 'Se obtuvo el dato concreto con cifras reales.' },
    { met: false, reason: 'No se llegó a tocar este tema con hechos pasados.' }
  ]
})

let dataDir = ''

/** Escribe un transcript.json con las líneas indicadas y devuelve su ruta. */
function writeTranscript(lines: Array<{ channel: string; text: string }>): string {
  const path = join(dataDir, 'entrevista.transcript.json')
  writeFileSync(
    path,
    JSON.stringify({
      lines: lines.map((line, index) => ({
        channel: line.channel,
        text: line.text,
        startMs: index * 1000,
        endMs: index * 1000 + 900,
        receivedAtMs: index * 1000 + 950,
        speaker: 0
      })),
      latency: null,
      assistant: null,
      consent: null
    })
  )
  return path
}

/** Entrevista con 2 objetivos y transcript con conversación real. */
function seedInterview(
  overrides: { objectives?: string[]; withTranscript?: boolean } = {}
): Interview {
  const { objectives = ['Objetivo cero', 'Objetivo uno'], withTranscript = true } = overrides
  const discovery = repository.createDiscovery({ name: 'Discovery Maurya' })
  const created = repository.createInterview({
    discoveryId: discovery.id,
    title: 'Discovery con Acme'
  })
  const transcriptPath = withTranscript
    ? writeTranscript([
        { channel: 'mic', text: '¿Cuándo fue la última vez que pasó?' },
        { channel: 'system', text: 'El mes pasado, nos costó dos días de trabajo.' }
      ])
    : null
  return repository.updateInterview(created.id, {
    objectives,
    transcriptPath,
    status: withTranscript ? 'recorded' : 'draft'
  })
}

/** Espera a que el camino automático (fire-and-forget) emita `count` eventos. */
async function waitForEvents(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(harness.sent.length).toBeGreaterThanOrEqual(count)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.sent.length = 0
  dataDir = mkdtempSync(join(tmpdir(), 'maurya-objectives-'))
  initStore(dataDir)
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key'
})

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY']
})

describe('objectiveEvaluationService', () => {
  describe('successful evaluation', () => {
    // SPEC-025 · AC-09 (persistencia) + AC-18 (coste en aiUsage, SPEC-021)
    it('persists aligned objectiveResults and accumulates the call usage into aiUsage', async () => {
      const interview = seedInterview()
      harness.create.mockResolvedValue(sdkResponse(VALID_JSON))

      const updated = await evaluateInterviewObjectives(interview.id)

      expect(updated.objectiveResults).toEqual([
        { met: true, reason: 'Se obtuvo el dato concreto con cifras reales.' },
        { met: false, reason: 'No se llegó a tocar este tema con hechos pasados.' }
      ])
      // AC-18: la llamada queda contabilizada en el acumulado de la entrevista
      expect(updated.aiUsage).toMatchObject({
        calls: 1,
        inputTokens: 1000,
        outputTokens: 200
      })
      // La conversación etiquetada viaja en el prompt de usuario
      const request = harness.create.mock.calls[0][0] as {
        messages: Array<{ content: string }>
      }
      expect(request.messages[0].content).toContain(
        '[system s0] El mes pasado, nos costó dos días de trabajo.'
      )
    })

    // SPEC-025 · AC-12 (servicio): la pista en vivo no es vinculante
    it('passes the live hint as a non-binding clue and persists the final verdict over it', async () => {
      const interview = seedInterview()
      // El LLM concluye que el objetivo 0 (marcado en vivo) NO se cumplió
      harness.create.mockResolvedValue(
        sdkResponse(
          JSON.stringify({
            evaluations: [
              { met: false, reason: 'Solo hubo un cumplido de cortesía, sin hechos.' },
              { met: true, reason: 'Se obtuvo la cifra concreta del incidente.' }
            ]
          })
        )
      )

      const updated = await evaluateInterviewObjectives(interview.id, [0])

      const request = harness.create.mock.calls[0][0] as {
        messages: Array<{ content: string }>
      }
      expect(request.messages[0].content).toContain('pista no vinculante')
      expect(request.messages[0].content).toContain('0')
      // Prevalece la evaluación final sobre el seguimiento en vivo
      expect(updated.objectiveResults?.[0]).toEqual({
        met: false,
        reason: 'Solo hubo un cumplido de cortesía, sin hechos.'
      })
    })
  })

  describe('format guards', () => {
    // SPEC-025 · AC-17 (robustez de formato, Notas técnicas: alineación por índice)
    it('treats a wrong-length evaluations array as a format error without persisting', async () => {
      const interview = seedInterview()
      harness.create.mockResolvedValue(
        sdkResponse(JSON.stringify({ evaluations: [{ met: true, reason: 'Solo una entrada.' }] }))
      )

      const caught = await evaluateInterviewObjectives(interview.id).then(
        () => null,
        (error: unknown) => error
      )

      expect(caught).toBeInstanceOf(LlmOperationError)
      expect((caught as LlmOperationError).kind).toBe('format')
      const persisted = repository.getInterview(interview.id)
      expect(persisted.objectiveResults ?? null).toBeNull()
    })
  })

  describe('post-recording trigger', () => {
    // SPEC-025 · AC-07 + AC-08 (lado main): la parada no espera; el progreso viaja por eventos
    it('returns synchronously and emits evaluating/done events without blocking on the LLM call', async () => {
      const interview = seedInterview()
      let resolveCall!: (value: unknown) => void
      harness.create.mockReturnValue(
        new Promise((resolve) => {
          resolveCall = resolve
        })
      )

      // Fire-and-forget: retorna void de inmediato aunque la llamada siga en vuelo
      expect(maybeEvaluateAfterRecording(interview.id, [])).toBeUndefined()

      await waitForEvents(1)
      expect(harness.sent[0]).toEqual({
        channel: 'llm:objective-evaluation',
        payload: { interviewId: interview.id, status: 'evaluating' }
      })
      expect(harness.sent).toHaveLength(1)

      resolveCall(sdkResponse(VALID_JSON))
      await waitForEvents(2)
      const done = harness.sent[1].payload
      expect(done.status).toBe('done')
      if (done.status === 'done') {
        expect(done.interview.objectiveResults).toHaveLength(2)
      }
    })

    // SPEC-025 · AC-17 (servicio): el fallo no toca la entrevista y emite el evento de error
    it('keeps the interview untouched and emits the error event when the automatic call fails', async () => {
      const interview = seedInterview()
      harness.create.mockRejectedValue(new harness.errors.AuthenticationError('bad key'))

      maybeEvaluateAfterRecording(interview.id, [])

      await waitForEvents(2)
      const error = harness.sent[1].payload
      expect(error.status).toBe('error')
      if (error.status === 'error') {
        expect(error.error.kind).toBe('auth')
      }
      const persisted = repository.getInterview(interview.id)
      expect(persisted.objectiveResults ?? null).toBeNull()
      expect(persisted.transcriptPath).not.toBeNull()
    })

    // SPEC-025 · AC-13
    it('launches nothing when no Anthropic key is resolvable', async () => {
      const interview = seedInterview()
      delete process.env['ANTHROPIC_API_KEY']

      maybeEvaluateAfterRecording(interview.id, [])
      await new Promise((resolve) => setImmediate(resolve))

      expect(harness.create).not.toHaveBeenCalled()
      expect(harness.sent).toHaveLength(0)
    })

    // SPEC-025 · AC-14
    it('launches nothing when the interview has no objectives', async () => {
      const interview = seedInterview({ objectives: [] })

      maybeEvaluateAfterRecording(interview.id, [])
      await new Promise((resolve) => setImmediate(resolve))

      expect(harness.create).not.toHaveBeenCalled()
      expect(harness.sent).toHaveLength(0)
    })

    // SPEC-025 · AC-15
    it('launches nothing when the transcript has no final lines', async () => {
      const interview = seedInterview()
      repository.updateInterview(interview.id, { transcriptPath: writeTranscript([]) })

      maybeEvaluateAfterRecording(interview.id, [])
      await new Promise((resolve) => setImmediate(resolve))

      expect(harness.create).not.toHaveBeenCalled()
      expect(harness.sent).toHaveLength(0)
    })

    // SPEC-025 · AC-16 (límite de coste de SPEC-021, mismo redondeo que la pausa)
    it('launches nothing when the AI cost limit is already reached', async () => {
      const interview = seedInterview()
      repository.setAiCostSettings({ limitUsd: 1 })
      repository.addInterviewAiUsage(interview.id, {
        calls: 5,
        inputTokens: 100000,
        outputTokens: 20000,
        estimatedCostUsd: 1.5
      })

      maybeEvaluateAfterRecording(interview.id, [])
      await new Promise((resolve) => setImmediate(resolve))

      expect(harness.create).not.toHaveBeenCalled()
      expect(harness.sent).toHaveLength(0)
    })
  })
})
