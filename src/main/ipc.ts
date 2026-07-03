import { ipcMain, shell } from 'electron'
import type { PermissionTarget, StopResult } from '../renderer/src/types/audio'
import {
  askForMicrophoneAccess,
  getPermissionsSnapshot,
  openPrivacySettings
} from './permissionService'
import { startRecording, stopRecording, writeChunk } from './wavFileService'
import {
  finishTranscription,
  persistTranscript,
  pushAudio,
  resetTranscription,
  startTranscription
} from './transcriptionService'
import { registerDbIpcHandlers } from './db/ipc'

/** Registra todos los canales IPC del spike (excepto el close guard, que vive en index.ts). */
export function registerIpcHandlers(): void {
  registerDbIpcHandlers()

  ipcMain.handle('permissions:get-status', () => getPermissionsSnapshot())

  ipcMain.handle('permissions:request-microphone', () => askForMicrophoneAccess())

  ipcMain.handle('permissions:open-settings', (_event, target: PermissionTarget) =>
    openPrivacySettings(target)
  )

  ipcMain.handle('recording:start', (event) => {
    const filePath = startRecording()
    // Transcripción acoplada a la captura (SPEC-002): sin gesto adicional
    startTranscription(event.sender)
    return filePath
  })

  ipcMain.on('recording:write-chunk', (event, chunk: ArrayBuffer) => {
    const buffer = Buffer.from(chunk)
    try {
      writeChunk(buffer)
    } catch (error) {
      event.sender.send(
        'recording:error',
        `Error al escribir el archivo de grabación: ${String(error)}`
      )
    }
    // Tee hacia Deepgram: nunca puede afectar a la escritura del WAV
    try {
      pushAudio(buffer)
    } catch {
      // la transcripción es degradable; el WAV sigue siendo la fuente de verdad
    }
  })

  ipcMain.handle('recording:stop', async (): Promise<StopResult> => {
    // Primero el flush de Deepgram (CloseStream + últimos finales), luego el WAV
    await finishTranscription()
    let result: ReturnType<typeof stopRecording>
    try {
      result = stopRecording()
    } catch (error) {
      resetTranscription()
      throw error
    }
    const { transcriptPath, latency } = persistTranscript(result.filePath)
    return { ...result, transcriptPath, latency }
  })

  ipcMain.handle('recording:show-in-finder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
}
