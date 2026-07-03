// @vitest-environment node
/**
 * Tests de src/main/deepgramService.ts (Node) con el WebSocket global stubbeado
 * (sin red): capa de parseo de los mensajes `Results` del protocolo de Deepgram
 * que alimenta los parciales/finales del renderer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeepgramConnection } from '../../../src/main/deepgramService'

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

beforeEach(() => {
  FakeWebSocket.last = null
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DeepgramConnection', () => {
  describe('when messages arrive over the WebSocket', () => {
    // SPEC-002 · AC-01 (capa main: parseo de mensajes Results → eventos tipados)
    it('normalizes Results messages into typed partial/final events per channel and ignores non-Results or malformed payloads', () => {
      const onResult = vi.fn()
      new DeepgramConnection('dg-key', {
        onOpen: vi.fn(),
        onResult,
        onClose: vi.fn(),
        onError: vi.fn()
      })
      const socket = FakeWebSocket.last
      if (socket === null) {
        throw new Error('DeepgramConnection no creó el WebSocket')
      }
      // Autenticación por subprotocolo: la key nunca va en la URL
      expect(socket.protocols).toEqual(['token', 'dg-key'])
      expect(socket.url).toContain('multichannel=true')
      // SPEC-004: la diarización va activada en la URL del stream
      expect(socket.url).toContain('diarize=true')

      // Parcial del canal 1 (sistema)
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'Results',
          channel_index: [1, 2],
          is_final: false,
          start: 3.5,
          duration: 1.25,
          channel: { alternatives: [{ transcript: 'hola parcial' }] }
        })
      })
      expect(onResult).toHaveBeenCalledWith({
        channelIndex: 1,
        transcript: 'hola parcial',
        isFinal: false,
        startSeconds: 3.5,
        durationSeconds: 1.25,
        // SPEC-004: sin words[] en el fixture → speaker null
        speaker: null
      })

      // Final del canal 0 (micrófono)
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'Results',
          channel_index: [0, 2],
          is_final: true,
          start: 3.5,
          duration: 2,
          channel: { alternatives: [{ transcript: 'hola final' }] }
        })
      })
      expect(onResult).toHaveBeenCalledWith({
        channelIndex: 0,
        transcript: 'hola final',
        isFinal: true,
        startSeconds: 3.5,
        durationSeconds: 2,
        // SPEC-004: sin words[] en el fixture → speaker null
        speaker: null
      })

      // Mensajes que no son Results, JSON corrupto y binarios se ignoran
      socket.onmessage?.({ data: JSON.stringify({ type: 'Metadata' }) })
      socket.onmessage?.({ data: 'esto no es JSON{' })
      socket.onmessage?.({ data: new ArrayBuffer(4) })
      expect(onResult).toHaveBeenCalledTimes(2)
    })
  })
})
