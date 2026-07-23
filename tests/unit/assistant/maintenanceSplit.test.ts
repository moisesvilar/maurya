// @vitest-environment node
/**
 * Revisión de coste 2026-07: split del asistente en llamada interactiva +
 * llamada de mantenimiento — parámetros de la request según la configuración
 * por tarea (modelo, thinking, effort), skip determinista del mantenimiento
 * (sin cola y sin objetivos pendientes → cero llamadas) y prefijo propio del
 * mantenimiento con cache_control en el último bloque.
 *
 * Arnés de SPEC-016 (SDK y Deepgram mockeados, store/repository y
 * transcriptionService REALES, fake timers solo de Date).
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  startAssistant,
  stopAssistant,
  triggerAssistantMaintenance
} from '../../../src/main/assistantService'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import type { DeepgramCallbacks } from '../../../src/main/deepgramService'
import { resetTranscription, startTranscription } from '../../../src/main/transcriptionService'
import {
  DEFAULT_AI_TASK_SETTINGS,
  type AiTaskSettings
} from '../../../src/renderer/src/types/domain'

const harness = vi.hoisted(() => {
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

interface CreateParams {
  model: string
  thinking?: { type: string; budget_tokens?: number }
  output_config: { effort?: string; format: { type: string } }
  system: Array<{ type: string; text: string; cache_control?: { type: string } }>
}

function createCall(index: number): CreateParams {
  return harness.create.mock.calls[index][0] as CreateParams
}

function sdkResponse(payload: Record<string, unknown>): unknown {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(payload) }]
  }
}

const INTERACTIVE_PAYLOAD = {
  action: 'continue',
  suggestedQuestion: '¿Cuándo fue la última vez que pasó?',
  reason: 'Ya hay material concreto para avanzar',
  alarms: [],
  scriptCursor: ''
}

function createSender(): { sender: WebContents; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn()
  const senderLike = { isDestroyed: (): boolean => false, send }
  return { sender: senderLike as unknown as WebContents, send }
}

let connection: FakeConnection
let lineCounter = 0

function feedFinal(): void {
  lineCounter += 1
  connection.callbacks.onResult({
    channelIndex: lineCounter % 2,
    transcript: `Línea de conversación ${lineCounter}`,
    isFinal: true,
    startSeconds: lineCounter,
    durationSeconds: 1,
    speaker: 0
  })
}

/**
 * Arranca la sesión sobre una entrevista configurable. `settings` persiste la
 * configuración por tarea ANTES de startAssistant (se lee una vez por sesión).
 */
function startSession(options: { objectives?: string[]; settings?: AiTaskSettings } = {}): void {
  if (options.settings !== undefined) {
    repository.setAiTaskSettings(options.settings)
  }
  const discovery = repository.createDiscovery({ name: 'Discovery Maurya' })
  const interview = repository.createInterview({
    discoveryId: discovery.id,
    title: 'Entrevista split'
  })
  repository.updateInterview(interview.id, {
    objectives: options.objectives ?? ['Objetivo cero', 'Objetivo uno'],
    scriptMarkdown: '# Guión de la entrevista'
  })

  const transcriptionSender = createSender()
  startTranscription(transcriptionSender.sender)
  connection = harness.dgInstances[0] as FakeConnection
  connection.opened = true
  connection.isOpen = true
  connection.callbacks.onOpen()

  const assistantSender = createSender()
  startAssistant(assistantSender.sender, interview.id)
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.dgInstances.length = 0
  lineCounter = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000_000_000)
  initStore(mkdtempSync(join(tmpdir(), 'maurya-maintenance-split-')))
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
  process.env['DEEPGRAM_API_KEY'] = 'dg-test'
})

afterEach(() => {
  stopAssistant()
  resetTranscription()
  vi.useRealTimers()
  delete process.env['ANTHROPIC_API_KEY']
  delete process.env['DEEPGRAM_API_KEY']
})

describe('assistantService (split interactivo/mantenimiento, revisión de coste 2026-07)', () => {
  it('sends the interactive call with the default Haiku config: no thinking param and no effort', async () => {
    harness.create.mockResolvedValueOnce(sdkResponse(INTERACTIVE_PAYLOAD))
    startSession()
    feedFinal()
    feedFinal()
    feedFinal()
    await vi.waitFor(() => expect(harness.create).toHaveBeenCalledTimes(1))

    const params = createCall(0)
    expect(params.model).toBe('claude-haiku-4-5')
    // Haiku sin thinking: el parámetro se OMITE (enviarlo con adaptive daría 400)
    expect(params.thinking).toBeUndefined()
    // Haiku no soporta effort: no debe viajar
    expect(params.output_config.effort).toBeUndefined()
    expect(params.output_config.format.type).toBe('json_schema')
  })

  it('sends the maintenance call with the default Sonnet 5 config: adaptive thinking and its own cached prefix', async () => {
    harness.create.mockResolvedValueOnce(
      sdkResponse({ resolvedQueueIndexes: [], objectivesMet: [] })
    )
    startSession()
    feedFinal()
    triggerAssistantMaintenance()
    await vi.waitFor(() => expect(harness.create).toHaveBeenCalledTimes(1))

    const params = createCall(0)
    expect(params.model).toBe('claude-sonnet-5')
    expect(params.thinking).toEqual({ type: 'adaptive' })
    // Prefijo propio: instrucciones + objetivos, cache_control en el ÚLTIMO bloque
    expect(Array.isArray(params.system)).toBe(true)
    const lastBlock = params.system[params.system.length - 1]
    expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' })
    expect(params.system.map((block) => block.text).join('\n')).toContain(
      '## Objetivos de la entrevista'
    )
  })

  it('applies a per-task override read once at session start (Opus + thinking → adaptive + effort low)', async () => {
    harness.create.mockResolvedValueOnce(sdkResponse(INTERACTIVE_PAYLOAD))
    startSession({
      settings: {
        ...DEFAULT_AI_TASK_SETTINGS,
        assistantInteractive: { model: 'claude-opus-4-8', thinking: true }
      }
    })
    feedFinal()
    feedFinal()
    feedFinal()
    await vi.waitFor(() => expect(harness.create).toHaveBeenCalledTimes(1))

    const params = createCall(0)
    expect(params.model).toBe('claude-opus-4-8')
    expect(params.thinking).toEqual({ type: 'adaptive' })
    // Opus sí soporta effort: se conserva el 'low' histórico del asistente
    expect(params.output_config.effort).toBe('low')
  })

  it('skips maintenance deterministically when the queue is empty and there are no pending objectives', async () => {
    // Entrevista SIN objetivos y cola vacía: no hay nada que mantener
    startSession({ objectives: [] })
    feedFinal()
    triggerAssistantMaintenance()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(harness.create).not.toHaveBeenCalled()

    // Sin material nuevo tampoco llama, aunque haya objetivos pendientes
    stopAssistant()
    resetTranscription()
    harness.dgInstances.length = 0
    startSession()
    triggerAssistantMaintenance()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(harness.create).not.toHaveBeenCalled()
  })
})
