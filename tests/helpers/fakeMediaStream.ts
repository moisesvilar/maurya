/**
 * Fakes mínimos de MediaStream/MediaStreamTrack para jsdom (que no los trae).
 * La pista extiende EventTarget para poder disparar el evento 'ended' que
 * useAudioCapture escucha para detectar la desconexión del dispositivo (AC-13).
 */
import { vi } from 'vitest'

export class FakeMediaStreamTrack extends EventTarget {
  readonly kind: string = 'audio'
  readonly stop = vi.fn()

  /** Simula la desconexión física del dispositivo. */
  disconnect(): void {
    this.dispatchEvent(new Event('ended'))
  }
}

export interface FakeAudioStream {
  stream: MediaStream
  track: FakeMediaStreamTrack
}

export function createFakeAudioStream(): FakeAudioStream {
  const track = new FakeMediaStreamTrack()
  const streamLike = {
    getAudioTracks: (): FakeMediaStreamTrack[] => [track],
    getTracks: (): FakeMediaStreamTrack[] => [track],
    getVideoTracks: (): FakeMediaStreamTrack[] => []
  }
  return { stream: streamLike as unknown as MediaStream, track }
}
