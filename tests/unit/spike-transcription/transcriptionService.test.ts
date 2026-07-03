// @vitest-environment node
/**
 * Tests de src/main/transcriptionService.ts (Node) con DeepgramConnection
 * mockeada (sin red). La persistencia usa fs real en un directorio temporal.
 */
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeepgramCallbacks } from '../../../src/main/deepgramService'
import {
  finishTranscription,
  persistTranscript,
  resetTranscription,
  startTranscription
} from '../../../src/main/transcriptionService'

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

interface PersistedLine {
  channel: string
  text: string
  startMs: number
  endMs: number
  receivedAtMs: number
}

/** Forma del transcript.json desde SPEC-003: { lines, latency }. */
interface PersistedTranscript {
  lines: PersistedLine[]
  latency: { count: number; p50Ms: number; p95Ms: number; maxMs: number } | null
}

function getConnection(index: number): FakeConnection {
  const connection = harness.instances[index] as FakeConnection | undefined
  if (connection === undefined) {
    throw new Error(`No se creó la conexión con Deepgram nº ${index + 1}`)
  }
  return connection
}

function createSender(): { sender: WebContents; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn()
  const senderLike = {
    isDestroyed: (): boolean => false,
    send
  }
  return { sender: senderLike as unknown as WebContents, send }
}

function openConnection(connection: FakeConnection): void {
  connection.opened = true
  connection.isOpen = true
  connection.callbacks.onOpen()
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

describe('transcriptionService', () => {
  describe('when the capture starts with an API key configured', () => {
    // SPEC-002 · AC-08
    it('activates the transcription automatically, opening the Deepgram connection with no extra steps', () => {
      const { sender, send } = createSender()
      startTranscription(sender)

      // La conexión se abre sola al iniciar y el estado avanza connecting → active
      expect(send).toHaveBeenCalledWith('transcription:status', { status: 'connecting' })
      expect(harness.instances).toHaveLength(1)
      const connection = getConnection(0)
      expect(connection.apiKey).toBe('dg-test-key')

      openConnection(connection)
      expect(send).toHaveBeenCalledWith('transcription:status', { status: 'active' })
    })
  })

  describe('when the user stops the capture', () => {
    // SPEC-002 · AC-05
    it('closes the Deepgram stream cleanly (CloseStream + flush) and persists the final lines as .transcript.json next to the WAV', async () => {
      const { sender } = createSender()
      startTranscription(sender)
      const connection = getConnection(0)
      openConnection(connection)

      connection.callbacks.onResult({
        channelIndex: 0,
        transcript: 'hola desde el micro',
        isFinal: true,
        startSeconds: 0,
        durationSeconds: 1.2
      })
      connection.callbacks.onResult({
        channelIndex: 1,
        transcript: 'hola desde el sistema',
        isFinal: true,
        startSeconds: 1.5,
        durationSeconds: 1.0
      })

      const finishPromise = finishTranscription()
      // Cierre limpio: se pide el flush con CloseStream y se espera el cierre del servidor
      expect(connection.closeStream).toHaveBeenCalledTimes(1)
      connection.isOpen = false
      connection.callbacks.onClose(1000)
      await finishPromise
      expect(connection.terminate).toHaveBeenCalledTimes(1)

      const dir = mkdtempSync(join(tmpdir(), 'maurya-transcript-'))
      const wavPath = join(dir, 'spike-20260703.wav')
      // SPEC-003 cambió la firma (PersistResult) y la forma del JSON ({ lines, latency })
      const { transcriptPath } = persistTranscript(wavPath)
      expect(transcriptPath).toBe(join(dir, 'spike-20260703.transcript.json'))
      if (transcriptPath === null) {
        throw new Error('persistTranscript devolvió null con líneas finales recibidas')
      }
      const persisted = JSON.parse(readFileSync(transcriptPath, 'utf8')) as PersistedTranscript
      expect(persisted.lines).toHaveLength(2)
      expect(persisted.lines[0].channel).toBe('mic')
      expect(persisted.lines[0].text).toBe('hola desde el micro')
      expect(persisted.lines[1].channel).toBe('system')
      expect(persisted.lines[1].text).toBe('hola desde el sistema')
      // Cada línea persiste sus timestamps (base de la medición de latencia del ítem 4)
      for (const line of persisted.lines) {
        expect(typeof line.startMs).toBe('number')
        expect(typeof line.endMs).toBe('number')
        expect(typeof line.receivedAtMs).toBe('number')
      }
    })
  })

  describe('when the connection drops while transcribing', () => {
    // SPEC-002 · AC-11
    it('retries once automatically and, if the retry fails, gives up keeping the lines already received', async () => {
      const { sender, send } = createSender()
      startTranscription(sender)
      const first = getConnection(0)
      openConnection(first)

      first.callbacks.onResult({
        channelIndex: 1,
        transcript: 'línea antes de la caída',
        isFinal: true,
        startSeconds: 0,
        durationSeconds: 1
      })

      // Cae la conexión ya abierta → estado 'disconnected' con causa + 1 reintento
      first.isOpen = false
      first.callbacks.onClose(1006)
      expect(send).toHaveBeenCalledWith('transcription:status', {
        status: 'disconnected',
        error: {
          kind: 'deepgram-connection',
          message: expect.stringContaining('Reintentando la conexión')
        }
      })
      expect(harness.instances).toHaveLength(2)

      // El reintento nunca llega a abrirse y también cae → se rinde (sin más reintentos)
      const second = getConnection(1)
      second.callbacks.onClose(1006)
      await vi.waitFor(() => {
        expect(send).toHaveBeenCalledWith('transcription:status', {
          status: 'disconnected',
          error: {
            kind: 'deepgram-connection',
            message: expect.stringContaining('No se pudo restablecer la conexión')
          }
        })
      })
      expect(harness.instances).toHaveLength(2)

      // Las líneas ya recibidas se conservan y se persisten al detener
      const dir = mkdtempSync(join(tmpdir(), 'maurya-transcript-retry-'))
      const { transcriptPath } = persistTranscript(join(dir, 'spike-retry.wav'))
      if (transcriptPath === null) {
        throw new Error('persistTranscript devolvió null: se perdieron las líneas recibidas')
      }
      const persisted = JSON.parse(readFileSync(transcriptPath, 'utf8')) as PersistedTranscript
      expect(persisted.lines).toHaveLength(1)
      expect(persisted.lines[0].channel).toBe('system')
      expect(persisted.lines[0].text).toBe('línea antes de la caída')
    })
  })
})
