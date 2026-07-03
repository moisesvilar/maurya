/**
 * Mock tipado del bridge `window.api` (frontera de mocking del renderer).
 * Cada función es un vi.fn() con la firma exacta de MauryaApi, de modo que los
 * tests pueden configurarlo con vi.mocked(...) sin ningún `as any`.
 */
import { vi } from 'vitest'
import type { MauryaApi, TranscriptResultEvent, TranscriptionStatusEvent } from '@/types/audio'
import type { DbApi } from '@/types/domain'

/** Forma completa del bridge desde SPEC-006: MauryaApi + api.db. */
export type BridgeApi = MauryaApi & { db: DbApi }

export interface MockApiHandle {
  api: BridgeApi
  /** Simula que main solicita el cierre de la ventana (before close). */
  emitCloseRequested: () => void
  /** Simula un error de escritura reportado por main durante el streaming. */
  emitRecordingError: (message: string) => void
  /** Simula un cambio de estado de la transcripción emitido por main (SPEC-002). */
  emitTranscriptionStatus: (event: TranscriptionStatusEvent) => void
  /** Simula un resultado (parcial o final) de transcripción emitido por main (SPEC-002). */
  emitTranscriptionResult: (event: TranscriptResultEvent) => void
}

/**
 * Mock tipado de api.db (SPEC-006). Sin comportamiento por defecto salvo los
 * de solo-lectura seguros (getStatus, listados y getNoteByInterview): la UI
 * CRUD llega en H2 y cada test configurará lo que necesite con vi.mocked(...).
 */
function createMockDbApi(): DbApi {
  return {
    getStatus: vi
      .fn<DbApi['getStatus']>()
      .mockResolvedValue({ ok: true, data: { ready: true, initError: null } }),

    createDiscovery: vi.fn<DbApi['createDiscovery']>(),
    listDiscoveries: vi.fn<DbApi['listDiscoveries']>().mockResolvedValue({ ok: true, data: [] }),
    getDiscovery: vi.fn<DbApi['getDiscovery']>(),
    updateDiscovery: vi.fn<DbApi['updateDiscovery']>(),
    deleteDiscovery: vi.fn<DbApi['deleteDiscovery']>(),

    createCompany: vi.fn<DbApi['createCompany']>(),
    listCompanies: vi.fn<DbApi['listCompanies']>().mockResolvedValue({ ok: true, data: [] }),
    getCompany: vi.fn<DbApi['getCompany']>(),
    updateCompany: vi.fn<DbApi['updateCompany']>(),
    deleteCompany: vi.fn<DbApi['deleteCompany']>(),

    createContact: vi.fn<DbApi['createContact']>(),
    listContacts: vi.fn<DbApi['listContacts']>().mockResolvedValue({ ok: true, data: [] }),
    getContact: vi.fn<DbApi['getContact']>(),
    updateContact: vi.fn<DbApi['updateContact']>(),
    deleteContact: vi.fn<DbApi['deleteContact']>(),

    createInterviewTemplate: vi.fn<DbApi['createInterviewTemplate']>(),
    listInterviewTemplates: vi
      .fn<DbApi['listInterviewTemplates']>()
      .mockResolvedValue({ ok: true, data: [] }),
    getInterviewTemplate: vi.fn<DbApi['getInterviewTemplate']>(),
    updateInterviewTemplate: vi.fn<DbApi['updateInterviewTemplate']>(),
    deleteInterviewTemplate: vi.fn<DbApi['deleteInterviewTemplate']>(),

    createInterview: vi.fn<DbApi['createInterview']>(),
    listInterviews: vi.fn<DbApi['listInterviews']>().mockResolvedValue({ ok: true, data: [] }),
    getInterview: vi.fn<DbApi['getInterview']>(),
    updateInterview: vi.fn<DbApi['updateInterview']>(),
    deleteInterview: vi.fn<DbApi['deleteInterview']>(),

    createNoteTemplate: vi.fn<DbApi['createNoteTemplate']>(),
    listNoteTemplates: vi
      .fn<DbApi['listNoteTemplates']>()
      .mockResolvedValue({ ok: true, data: [] }),
    getNoteTemplate: vi.fn<DbApi['getNoteTemplate']>(),
    updateNoteTemplate: vi.fn<DbApi['updateNoteTemplate']>(),
    deleteNoteTemplate: vi.fn<DbApi['deleteNoteTemplate']>(),

    createNote: vi.fn<DbApi['createNote']>(),
    getNoteByInterview: vi
      .fn<DbApi['getNoteByInterview']>()
      .mockResolvedValue({ ok: true, data: null }),
    updateNote: vi.fn<DbApi['updateNote']>(),
    deleteNote: vi.fn<DbApi['deleteNote']>()
  }
}

export function createMockApi(): MockApiHandle {
  const closeCallbacks: Array<() => void> = []
  const errorCallbacks: Array<(message: string) => void> = []
  const statusCallbacks: Array<(event: TranscriptionStatusEvent) => void> = []
  const resultCallbacks: Array<(event: TranscriptResultEvent) => void> = []

  const api: BridgeApi = {
    db: createMockDbApi(),
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
