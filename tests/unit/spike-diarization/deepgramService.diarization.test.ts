// @vitest-environment node
/**
 * Tests de la extracción del hablante mayoritario (SPEC-004) en
 * src/main/deepgramService.ts, vía mensajes Results con words[] sobre el
 * WebSocket global stubbeado (majoritySpeaker no se exporta; se ejercita por
 * su única vía pública: el evento onResult).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeepgramConnection, type DeepgramCallbacks } from '../../../src/main/deepgramService'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static last: FakeWebSocket | null = null

  readonly url: string
  readonly protocols: string[]
  binaryType = 'blob'
  readyState: number = FakeWebSocket.OPEN
  bufferedAmount = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  readonly sent: unknown[] = []

  constructor(url: string, protocols: string[]) {
    this.url = url
    this.protocols = protocols
    FakeWebSocket.last = this
  }

  send(data: unknown): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
  }
}

interface ResultsFixture {
  isFinal: boolean
  words?: Array<{ speaker?: number }>
}

function createConnection(): { socket: FakeWebSocket; onResult: ReturnType<typeof vi.fn> } {
  const onResult = vi.fn()
  const callbacks: DeepgramCallbacks = {
    onOpen: vi.fn(),
    onResult,
    onClose: vi.fn(),
    onError: vi.fn()
  }
  new DeepgramConnection('dg-key', callbacks)
  const socket = FakeWebSocket.last
  if (socket === null) {
    throw new Error('DeepgramConnection no creó el WebSocket')
  }
  return { socket, onResult }
}

function emitResults(socket: FakeWebSocket, fixture: ResultsFixture): void {
  socket.onmessage?.({
    data: JSON.stringify({
      type: 'Results',
      channel_index: [0, 2],
      is_final: fixture.isFinal,
      start: 1,
      duration: 1.5,
      channel: { alternatives: [{ transcript: 'texto de prueba', words: fixture.words }] }
    })
  })
}

function lastSpeaker(onResult: ReturnType<typeof vi.fn>): unknown {
  const lastCall = onResult.mock.calls.at(-1)
  if (lastCall === undefined) {
    throw new Error('onResult no fue invocado')
  }
  return (lastCall[0] as { speaker: number | null }).speaker
}

beforeEach(() => {
  FakeWebSocket.last = null
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DeepgramConnection (diarización)', () => {
  describe('when a final result carries diarized words', () => {
    // SPEC-004 · AC-01 (capa main: extracción del hablante mayoritario)
    it('assigns the majority speaker of the words, resolving ties in favor of the first speaker to appear', () => {
      const { socket, onResult } = createConnection()

      // Todas las palabras de un mismo hablante → ese hablante
      emitResults(socket, {
        isFinal: true,
        words: [{ speaker: 1 }, { speaker: 1 }, { speaker: 1 }]
      })
      expect(lastSpeaker(onResult)).toBe(1)

      // Mayoría clara entre dos hablantes → el mayoritario
      emitResults(socket, {
        isFinal: true,
        words: [{ speaker: 0 }, { speaker: 0 }, { speaker: 1 }]
      })
      expect(lastSpeaker(onResult)).toBe(0)

      // Empate → el primero en aparecer (aquí el hablante 1)
      emitResults(socket, {
        isFinal: true,
        words: [{ speaker: 1 }, { speaker: 0 }, { speaker: 1 }, { speaker: 0 }]
      })
      expect(lastSpeaker(onResult)).toBe(1)
    })
  })

  describe('when the diarization provides no usable data', () => {
    // SPEC-004 · AC-04 (capa main: degradación → speaker null)
    it('emits speaker null for finals without words or whose words carry no speaker index', () => {
      const { socket, onResult } = createConnection()

      // Final sin words[]
      emitResults(socket, { isFinal: true })
      expect(lastSpeaker(onResult)).toBeNull()

      // Final con words pero sin índice de hablante en ninguna
      emitResults(socket, { isFinal: true, words: [{}, {}] })
      expect(lastSpeaker(onResult)).toBeNull()
    })
  })

  describe('when the result is an interim', () => {
    // SPEC-004 · AC-06 (capa main: los interims nunca llevan hablante)
    it('emits speaker null for interim results even if they carry diarized words', () => {
      const { socket, onResult } = createConnection()

      emitResults(socket, { isFinal: false, words: [{ speaker: 0 }, { speaker: 0 }] })
      expect(lastSpeaker(onResult)).toBeNull()
    })
  })
})
