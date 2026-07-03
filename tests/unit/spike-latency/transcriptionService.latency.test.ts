// @vitest-environment node
/**
 * Tests de las estadísticas de latencia STT de src/main/transcriptionService.ts
 * (SPEC-003): computeLatencyStats (función pura exportada) y la persistencia
 * del transcript.json con la forma { lines, latency }. DeepgramConnection
 * mockeada (sin red); fs real en directorio temporal.
 */
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeepgramCallbacks } from '../../../src/main/deepgramService'
import {
  computeLatencyStats,
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

/** Forma del transcript.json desde SPEC-003. */
interface PersistedTranscript {
  lines: TranscriptLine[]
  latency: LatencyStats | null
}

function getConnection(index: number): FakeConnection {
  const connection = harness.instances[index] as FakeConnection | undefined
  if (connection === undefined) {
    throw new Error(`No se creó la conexión con Deepgram nº ${index + 1}`)
  }
  return connection
}

function createSender(): WebContents {
  const senderLike = {
    isDestroyed: (): boolean => false,
    send: vi.fn()
  }
  return senderLike as unknown as WebContents
}

function openConnection(connection: FakeConnection): void {
  connection.opened = true
  connection.isOpen = true
  connection.callbacks.onOpen()
}

/** Construye una línea final con el delta receivedAtMs − endMs dado. */
function lineWithDelta(deltaMs: number, index = 0): TranscriptLine {
  const endMs = 10_000 + index * 1_000
  return {
    channel: index % 2 === 0 ? 'mic' : 'system',
    text: `línea ${index}`,
    startMs: endMs - 800,
    endMs,
    receivedAtMs: endMs + deltaMs
  }
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

describe('computeLatencyStats', () => {
  describe('when the session had a single final result', () => {
    // SPEC-003 · AC-07
    it('returns that single delta as median, p95 and max with count 1', () => {
      const stats = computeLatencyStats([lineWithDelta(1234)])
      expect(stats).toEqual({ count: 1, p50Ms: 1234, p95Ms: 1234, maxMs: 1234 })
    })
  })

  describe('when applying the nearest-rank method', () => {
    // SPEC-003 · refuerzo de AC-04 (método de cálculo de lo persistido/mostrado)
    it('returns null for an empty session, the lower central element as median for even n, and p95 on both sides of the 5 s threshold', () => {
      // Sin resultados finales → null (alimenta el empty state de AC-05)
      expect(computeLatencyStats([])).toBeNull()

      // n par → mediana = elemento inferior central (sin interpolación)
      const even = [400, 100, 300, 200].map((delta, index) => lineWithDelta(delta, index))
      expect(computeLatencyStats(even)).toEqual({
        count: 4,
        p50Ms: 200,
        p95Ms: 400,
        maxMs: 400
      })

      // Dataset con p95 dentro del objetivo (≤ 5000 ms): 20 deltas 100..2000
      const fast = Array.from({ length: 20 }, (_, index) => lineWithDelta((index + 1) * 100, index))
      const fastStats = computeLatencyStats(fast)
      expect(fastStats?.p95Ms).toBe(1900)
      expect(fastStats !== null && fastStats.p95Ms <= 5000).toBe(true)

      // Dataset con cola lenta: el p95 (nearest-rank, índice 18 de 20) supera el umbral
      const slow = [...Array.from({ length: 18 }, (_, index) => lineWithDelta(1000, index))]
      slow.push(lineWithDelta(5500, 18), lineWithDelta(6000, 19))
      const slowStats = computeLatencyStats(slow)
      expect(slowStats?.p95Ms).toBe(5500)
      expect(slowStats !== null && slowStats.p95Ms > 5000).toBe(true)
      expect(slowStats?.maxMs).toBe(6000)
    })
  })
})

describe('transcriptionService', () => {
  describe('when persisting a session with final results', () => {
    // SPEC-003 · AC-04
    it('writes a { lines, latency } JSON whose latency object matches both the returned stats and computeLatencyStats over the persisted lines', () => {
      startTranscription(createSender())
      const connection = getConnection(0)
      openConnection(connection)

      connection.callbacks.onResult({
        channelIndex: 0,
        transcript: 'primer final',
        isFinal: true,
        startSeconds: 0,
        durationSeconds: 1.2
      })
      connection.callbacks.onResult({
        channelIndex: 1,
        transcript: 'segundo final',
        isFinal: true,
        startSeconds: 1.5,
        durationSeconds: 0.8
      })
      connection.callbacks.onResult({
        channelIndex: 0,
        transcript: 'tercer final',
        isFinal: true,
        startSeconds: 3,
        durationSeconds: 1.1
      })

      const dir = mkdtempSync(join(tmpdir(), 'maurya-latency-'))
      const result = persistTranscript(join(dir, 'spike-latency.wav'))
      if (result.transcriptPath === null || result.latency === null) {
        throw new Error('persistTranscript devolvió null con resultados finales recibidos')
      }

      const persisted = JSON.parse(
        readFileSync(result.transcriptPath, 'utf8')
      ) as PersistedTranscript
      // El JSON incluye ambas claves y la latencia es coherente con lo mostrado
      // en pantalla (StopResult.latency = lo que devuelve persistTranscript)
      expect(persisted.lines).toHaveLength(3)
      expect(persisted.latency).toEqual(result.latency)
      // ...y coherente con la fórmula sobre las propias líneas persistidas
      expect(persisted.latency).toEqual(computeLatencyStats(persisted.lines))
      expect(result.latency.count).toBe(3)
      expect(typeof result.latency.p50Ms).toBe('number')
      expect(typeof result.latency.p95Ms).toBe('number')
      expect(typeof result.latency.maxMs).toBe('number')
      expect(result.latency.p50Ms).toBeLessThanOrEqual(result.latency.p95Ms)
      expect(result.latency.p95Ms).toBeLessThanOrEqual(result.latency.maxMs)
    })
  })

  describe('when the session had a connection drop and a successful retry', () => {
    // SPEC-003 · AC-06
    it('aggregates the final results of both connection stretches into a single latency dataset', () => {
      startTranscription(createSender())
      const first = getConnection(0)
      openConnection(first)

      // Tramo 1: un final antes de la caída
      first.callbacks.onResult({
        channelIndex: 0,
        transcript: 'final del primer tramo',
        isFinal: true,
        startSeconds: 0,
        durationSeconds: 1
      })

      // Caída de la conexión abierta → reintento automático (segunda conexión)
      first.isOpen = false
      first.callbacks.onClose(1006)
      const second = getConnection(1)
      openConnection(second)

      // Tramo 2: otro final tras la reconexión
      second.callbacks.onResult({
        channelIndex: 1,
        transcript: 'final del segundo tramo',
        isFinal: true,
        startSeconds: 5,
        durationSeconds: 1
      })

      const dir = mkdtempSync(join(tmpdir(), 'maurya-latency-retry-'))
      const result = persistTranscript(join(dir, 'spike-retry.wav'))
      if (result.transcriptPath === null || result.latency === null) {
        throw new Error('persistTranscript devolvió null con finales en ambos tramos')
      }

      // Las estadísticas agregan TODA la sesión: ambos tramos de conexión
      expect(result.latency.count).toBe(2)
      const persisted = JSON.parse(
        readFileSync(result.transcriptPath, 'utf8')
      ) as PersistedTranscript
      expect(persisted.lines).toHaveLength(2)
      expect(persisted.lines[0].text).toBe('final del primer tramo')
      expect(persisted.lines[1].text).toBe('final del segundo tramo')
      expect(persisted.latency?.count).toBe(2)
    })
  })
})
