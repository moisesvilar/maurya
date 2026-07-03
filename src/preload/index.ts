import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  MauryaApi,
  PermissionsSnapshot,
  PermissionTarget,
  StopResult,
  TranscriptResultEvent,
  TranscriptionStatusEvent
} from '../renderer/src/types/audio'
import type { DbApi } from '../renderer/src/types/domain'

/**
 * Bridge de persistencia (SPEC-006): API PLANA (`createCompany`, no
 * `company.create`) — desviación documentada respecto a la nota
 * `api.db.<entidad>.<operación>` de la spec, aprobada en el plan §3 para
 * mantener trivial el objeto expuesto por contextBridge. Cada método delega en
 * su canal `db:<entidad>:<op>` y SIEMPRE resuelve con el envelope DbResult
 * (los errores tipados viajan como valor, nunca como rejection).
 */
const db: DbApi = {
  getStatus: () => ipcRenderer.invoke('db:get-status'),

  createDiscovery: (input) => ipcRenderer.invoke('db:discovery:create', input),
  listDiscoveries: () => ipcRenderer.invoke('db:discovery:list'),
  getDiscovery: (id) => ipcRenderer.invoke('db:discovery:get', id),
  updateDiscovery: (id, patch) => ipcRenderer.invoke('db:discovery:update', id, patch),
  deleteDiscovery: (id) => ipcRenderer.invoke('db:discovery:delete', id),

  createCompany: (input) => ipcRenderer.invoke('db:company:create', input),
  listCompanies: (discoveryId) => ipcRenderer.invoke('db:company:list', discoveryId),
  getCompany: (id) => ipcRenderer.invoke('db:company:get', id),
  updateCompany: (id, patch) => ipcRenderer.invoke('db:company:update', id, patch),
  deleteCompany: (id) => ipcRenderer.invoke('db:company:delete', id),

  createContact: (input) => ipcRenderer.invoke('db:contact:create', input),
  listContacts: (companyId) => ipcRenderer.invoke('db:contact:list', companyId),
  getContact: (id) => ipcRenderer.invoke('db:contact:get', id),
  updateContact: (id, patch) => ipcRenderer.invoke('db:contact:update', id, patch),
  deleteContact: (id) => ipcRenderer.invoke('db:contact:delete', id),

  createInterviewTemplate: (input) => ipcRenderer.invoke('db:interview-template:create', input),
  listInterviewTemplates: () => ipcRenderer.invoke('db:interview-template:list'),
  getInterviewTemplate: (id) => ipcRenderer.invoke('db:interview-template:get', id),
  updateInterviewTemplate: (id, patch) =>
    ipcRenderer.invoke('db:interview-template:update', id, patch),
  deleteInterviewTemplate: (id) => ipcRenderer.invoke('db:interview-template:delete', id),

  createInterview: (input) => ipcRenderer.invoke('db:interview:create', input),
  listInterviews: (companyId) => ipcRenderer.invoke('db:interview:list', companyId),
  getInterview: (id) => ipcRenderer.invoke('db:interview:get', id),
  updateInterview: (id, patch) => ipcRenderer.invoke('db:interview:update', id, patch),
  deleteInterview: (id) => ipcRenderer.invoke('db:interview:delete', id),

  createNoteTemplate: (input) => ipcRenderer.invoke('db:note-template:create', input),
  listNoteTemplates: () => ipcRenderer.invoke('db:note-template:list'),
  getNoteTemplate: (id) => ipcRenderer.invoke('db:note-template:get', id),
  updateNoteTemplate: (id, patch) => ipcRenderer.invoke('db:note-template:update', id, patch),
  deleteNoteTemplate: (id) => ipcRenderer.invoke('db:note-template:delete', id),

  createNote: (input) => ipcRenderer.invoke('db:note:create', input),
  getNoteByInterview: (interviewId) => ipcRenderer.invoke('db:note:get-by-interview', interviewId),
  updateNote: (id, patch) => ipcRenderer.invoke('db:note:update', id, patch),
  deleteNote: (id) => ipcRenderer.invoke('db:note:delete', id)
}

const api: MauryaApi & { db: DbApi } = {
  permissions: {
    getStatus: (): Promise<PermissionsSnapshot> => ipcRenderer.invoke('permissions:get-status'),
    requestMicrophone: (): Promise<boolean> => ipcRenderer.invoke('permissions:request-microphone'),
    openSettings: (target: PermissionTarget): Promise<void> =>
      ipcRenderer.invoke('permissions:open-settings', target)
  },
  recording: {
    start: (): Promise<string> => ipcRenderer.invoke('recording:start'),
    writeChunk: (chunk: ArrayBuffer): void => {
      ipcRenderer.send('recording:write-chunk', chunk)
    },
    stop: (): Promise<StopResult> => ipcRenderer.invoke('recording:stop'),
    showInFinder: (filePath: string): Promise<void> =>
      ipcRenderer.invoke('recording:show-in-finder', filePath),
    onError: (callback: (message: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, message: string): void => callback(message)
      ipcRenderer.on('recording:error', listener)
      return (): void => {
        ipcRenderer.removeListener('recording:error', listener)
      }
    }
  },
  transcription: {
    onStatus: (callback: (event: TranscriptionStatusEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: TranscriptionStatusEvent): void =>
        callback(payload)
      ipcRenderer.on('transcription:status', listener)
      return (): void => {
        ipcRenderer.removeListener('transcription:status', listener)
      }
    },
    onResult: (callback: (event: TranscriptResultEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: TranscriptResultEvent): void =>
        callback(payload)
      ipcRenderer.on('transcription:result', listener)
      return (): void => {
        ipcRenderer.removeListener('transcription:result', listener)
      }
    }
  },
  window: {
    onCloseRequested: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('window:close-requested', listener)
      return (): void => {
        ipcRenderer.removeListener('window:close-requested', listener)
      }
    },
    confirmClose: (): void => {
      ipcRenderer.send('window:confirm-close')
    }
  },
  db
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
