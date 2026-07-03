// @vitest-environment node
/**
 * Tests de la persistencia del campo speaker (SPEC-004) en
 * src/main/transcriptionService.ts, con DeepgramConnection mockeada (sin red)
 * y fs real en directorio temporal.
 */
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeepgramCallbacks } from '../../../src/main/deepgramService'
import {
  persistTranscript,
  resetTranscription,
  startTranscription
} from '../../../src/main/transcriptionService'
import type { LatencyStats, TranscriptLine } from '../../../src/renderer/src/types/audio'

interface FakeConnection {
  apiKey: string
  callbacks: DeepgramCallbacks
  opened: boolean
  isOpen: boolean
  sendAudio: ReturnType<typeof vi.fn>
  sendKeepAlive: ReturnType<typeof vi.fn>
  closeStream: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
}

const harness = vi.hoisted(() => ({
  instances: [] as unknown[]
}))

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
      harness.instances.push(this)
    }
  },
  classifyConnectionFailure: vi.fn(() => Promise.resolve('other' as const))
}))

interface PersistedTranscript {
  lines: TranscriptLine[]
  latency: LatencyStats | null
}

function createSender(): WebContents {
  const senderLike = {
    isDestroyed: (): boolean => false,
    send: vi.fn()
  }
  return senderLike as unknown as WebContents
}

/** Arranca una sesión con la conexión abierta y devuelve sus callbacks. */
function startOpenSession(): DeepgramCallbacks {
  startTranscription(createSender())
  const connection = harness.instances[0] as FakeConnection | undefined
  if (connection === undefined) {
    throw new Error('No se creó la conexión con Deepgram')
  }
  connection.opened = true
  connection.isOpen = true
  connection.callbacks.onOpen()
  return connection.callbacks
}

function persistAndRead(prefix: string): PersistedTranscript {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  const { transcriptPath } = persistTranscript(join(dir, 'spike-diarization.wav'))
  if (transcriptPath === null) {
    throw new Error('persistTranscript devolvió null con líneas finales recibidas')
  }
  return JSON.parse(readFileSync(transcriptPath, 'utf8')) as PersistedTranscript
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.instances.length = 0
  resetTranscription()
  process.env['DEEPGRAM_API_KEY'] = 'dg-test-key'
})

afterEach(() => {
  resetTranscription()
  delete process.env['DEEPGRAM_API_KEY']
})

describe('transcriptionService (diarización)', () => {
  describe('when a final line has an identified speaker', () => {
    // SPEC-004 · AC-02
    it('persists the numeric speaker index in the transcript line', () => {
      const callbacks = startOpenSession()
      callbacks.onResult({
        channelIndex: 0,
        transcript: 'frase del segundo hablante',
        isFinal: true,
        startSeconds: 0,
        durationSeconds: 1.2,
        speaker: 1
      })

      const persisted = persistAndRead('maurya-diarization-')
      expect(persisted.lines).toHaveLength(1)
      expect(persisted.lines[0].speaker).toBe(1)
      expect(typeof persisted.lines[0].speaker).toBe('number')
    })
  })

  describe('when a final line has no speaker information', () => {
    // SPEC-004 · AC-04 (persistencia: speaker null explícito)
    it('persists speaker as an explicit null in the transcript line', () => {
      const callbacks = startOpenSession()
      callbacks.onResult({
        channelIndex: 1,
        transcript: 'frase sin diarización',
        isFinal: true,
        startSeconds: 0,
        durationSeconds: 1,
        speaker: null
      })

      const persisted = persistAndRead('maurya-diarization-null-')
      expect(persisted.lines).toHaveLength(1)
      // La clave existe en el JSON con valor null (no se omite)
      expect('speaker' in persisted.lines[0]).toBe(true)
      expect(persisted.lines[0].speaker).toBeNull()
    })
  })
})
