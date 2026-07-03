import { ipcMain, shell } from 'electron'
import type { PermissionTarget } from '../renderer/src/types/audio'
import {
  askForMicrophoneAccess,
  getPermissionsSnapshot,
  openPrivacySettings
} from './permissionService'
import { startRecording, stopRecording, writeChunk } from './wavFileService'

/** Registra todos los canales IPC del spike (excepto el close guard, que vive en index.ts). */
export function registerIpcHandlers(): void {
  ipcMain.handle('permissions:get-status', () => getPermissionsSnapshot())

  ipcMain.handle('permissions:request-microphone', () => askForMicrophoneAccess())

  ipcMain.handle('permissions:open-settings', (_event, target: PermissionTarget) =>
    openPrivacySettings(target)
  )

  ipcMain.handle('recording:start', () => startRecording())

  ipcMain.on('recording:write-chunk', (event, chunk: ArrayBuffer) => {
    try {
      writeChunk(Buffer.from(chunk))
    } catch (error) {
      event.sender.send(
        'recording:error',
        `Error al escribir el archivo de grabación: ${String(error)}`
      )
    }
  })

  ipcMain.handle('recording:stop', () => stopRecording())

  ipcMain.handle('recording:show-in-finder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
}
