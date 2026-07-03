/**
 * Mock tipado del bridge `window.api` (frontera de mocking del renderer).
 * Cada función es un vi.fn() con la firma exacta de MauryaApi, de modo que los
 * tests pueden configurarlo con vi.mocked(...) sin ningún `as any`.
 */
import { vi } from 'vitest'
import type { MauryaApi, TranscriptResultEvent, TranscriptionStatusEvent } from '@/types/audio'

export interface MockApiHandle {
  api: MauryaApi
  /** Simula que main solicita el cierre de la ventana (before close). */
  emitCloseRequested: () => void
  /** Simula un error de escritura reportado por main durante el streaming. */
  emitRecordingError: (message: string) => void
  /** Simula un cambio de estado de la transcripción emitido por main (SPEC-002). */
  emitTranscriptionStatus: (event: TranscriptionStatusEvent) => void
  /** Simula un resultado (parcial o final) de transcripción emitido por main (SPEC-002). */
  emitTranscriptionResult: (event: TranscriptResultEvent) => void
}

export function createMockApi(): MockApiHandle {
  const closeCallbacks: Array<() => void> = []
  const errorCallbacks: Array<(message: string) => void> = []
  const statusCallbacks: Array<(event: TranscriptionStatusEvent) => void> = []
  const resultCallbacks: Array<(event: TranscriptResultEvent) => void> = []

  const api: MauryaApi = {
    permissions: {
      getStatus: vi.fn<MauryaApi['permissions']['getStatus']>().mockResolvedValue({
        microphone: 'granted',
        systemAudio: 'granted'
      }),
      requestMicrophone: vi
        .fn<MauryaApi['permissions']['requestMicrophone']>()
        .mockResolvedValue(true),
      openSettings: vi.fn<MauryaApi['permissions']['openSettings']>().mockResolvedValue(undefined)
    },
    recording: {
      start: vi
        .fn<MauryaApi['recording']['start']>()
        .mockResolvedValue('/tmp/maurya-recordings/spike-test.wav'),
      writeChunk: vi.fn<MauryaApi['recording']['writeChunk']>(),
      stop: vi.fn<MauryaApi['recording']['stop']>(),
      showInFinder: vi.fn<MauryaApi['recording']['showInFinder']>().mockResolvedValue(undefined),
      onError: vi.fn<MauryaApi['recording']['onError']>((callback) => {
        errorCallbacks.push(callback)
        return () => {
          const index = errorCallbacks.indexOf(callback)
          if (index >= 0) {
            errorCallbacks.splice(index, 1)
          }
        }
      })
    },
    transcription: {
      onStatus: vi.fn<MauryaApi['transcription']['onStatus']>((callback) => {
        statusCallbacks.push(callback)
        return () => {
          const index = statusCallbacks.indexOf(callback)
          if (index >= 0) {
            statusCallbacks.splice(index, 1)
          }
        }
      }),
      onResult: vi.fn<MauryaApi['transcription']['onResult']>((callback) => {
        resultCallbacks.push(callback)
        return () => {
          const index = resultCallbacks.indexOf(callback)
          if (index >= 0) {
            resultCallbacks.splice(index, 1)
          }
        }
      })
    },
    window: {
      onCloseRequested: vi.fn<MauryaApi['window']['onCloseRequested']>((callback) => {
        closeCallbacks.push(callback)
        return () => {
          const index = closeCallbacks.indexOf(callback)
          if (index >= 0) {
            closeCallbacks.splice(index, 1)
          }
        }
      }),
      confirmClose: vi.fn<MauryaApi['window']['confirmClose']>()
    }
  }

  return {
    api,
    emitCloseRequested: (): void => {
      closeCallbacks.slice().forEach((callback) => callback())
    },
    emitRecordingError: (message: string): void => {
      errorCallbacks.slice().forEach((callback) => callback(message))
    },
    emitTranscriptionStatus: (event: TranscriptionStatusEvent): void => {
      statusCallbacks.slice().forEach((callback) => callback(event))
    },
    emitTranscriptionResult: (event: TranscriptResultEvent): void => {
      resultCallbacks.slice().forEach((callback) => callback(event))
    }
  }
}

/** Instala el mock como window.api y lo devuelve. */
export function installMockApi(): MockApiHandle {
  const handle = createMockApi()
  window.api = handle.api
  return handle
}
