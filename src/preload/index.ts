import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  MauryaApi,
  PermissionsSnapshot,
  PermissionTarget,
  RecordingResult
} from '../renderer/src/types/audio'

const api: MauryaApi = {
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
    stop: (): Promise<RecordingResult> => ipcRenderer.invoke('recording:stop'),
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
  }
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
