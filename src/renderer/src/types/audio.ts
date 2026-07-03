/**
 * Tipos compartidos del spike de captura de audio (SPEC-001).
 * Este módulo NO debe depender del DOM: lo importan (type-only) main y preload.
 */

/** Estados que devuelve systemPreferences.getMediaAccessStatus en macOS. */
export type PermissionState = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

export interface PermissionsSnapshot {
  microphone: PermissionState
  /**
   * Estado del permiso de captura de audio del sistema. En macOS se consulta el
   * TCC de 'screen' (Grabación de pantalla y audio del sistema) como proxy del
   * permiso real de CATap ("System Audio Recording Only").
   */
  systemAudio: PermissionState
}

export type PermissionTarget = 'microphone' | 'systemAudio'

export type CaptureStatus = 'idle' | 'starting' | 'recording' | 'stopping'

export interface AudioInputDevice {
  deviceId: string
  label: string
}

export interface RecordingResult {
  filePath: string
  durationSeconds: number
  sizeBytes: number
  sampleRate: number
  channels: number
}

export type CaptureErrorKind =
  | 'microphone-permission'
  | 'system-audio-permission'
  | 'device-disconnected'
  | 'file-write'
  | 'capture-failure'

export interface CaptureError {
  kind: CaptureErrorKind
  message: string
}

/** Nivel 0-100 por fuente para los medidores. */
export interface AudioLevels {
  microphone: number
  system: number
}

/** Contrato del bridge expuesto por el preload en window.api. */
export interface MauryaApi {
  permissions: {
    getStatus: () => Promise<PermissionsSnapshot>
    requestMicrophone: () => Promise<boolean>
    openSettings: (target: PermissionTarget) => Promise<void>
  }
  recording: {
    start: () => Promise<string>
    writeChunk: (chunk: ArrayBuffer) => void
    stop: () => Promise<RecordingResult>
    showInFinder: (filePath: string) => Promise<void>
    onError: (callback: (message: string) => void) => () => void
  }
  window: {
    onCloseRequested: (callback: () => void) => () => void
    confirmClose: () => void
  }
}
