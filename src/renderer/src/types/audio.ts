/**
 * Tipos compartidos del spike de captura de audio (SPEC-001) y de la
 * transcripción STT streaming con Deepgram (SPEC-002).
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
  | 'deepgram-auth'
  | 'deepgram-connection'

export interface CaptureError {
  kind: CaptureErrorKind
  message: string
}

/** Nivel 0-100 por fuente para los medidores. */
export interface AudioLevels {
  microphone: number
  system: number
}

/** Estado de la sesión de transcripción con Deepgram (SPEC-002). */
export type TranscriptionStatus = 'inactive' | 'connecting' | 'active' | 'disconnected' | 'no-key'

/** Fuente de una línea de transcripción: canal L = micrófono, canal R = sistema. */
export type TranscriptChannel = 'mic' | 'system'

/**
 * Línea final de transcripción tal y como se persiste en el .transcript.json.
 * Todos los tiempos son epoch ms; `receivedAtMs − endMs` es la base de la
 * medición de latencia del ítem 4 de H0.
 */
export interface TranscriptLine {
  channel: TranscriptChannel
  text: string
  startMs: number
  endMs: number
  receivedAtMs: number
  /**
   * Índice de hablante asignado por la diarización de Deepgram (SPEC-004),
   * 0-based; null si la diarización no aporta dato (Riesgo #9: degradación).
   */
  speaker: number | null
}

/** Resultado (parcial o final) que main envía al renderer por IPC. */
export interface TranscriptResultEvent extends TranscriptLine {
  isFinal: boolean
  /** Segundos desde el inicio de la captura, para el timestamp mm:ss de la UI. */
  offsetSeconds: number
}

/** Cambio de estado de la transcripción; `error` acompaña a los fallos de Deepgram. */
export interface TranscriptionStatusEvent {
  status: TranscriptionStatus
  error?: CaptureError
}

/**
 * Estadísticas de latencia STT de la sesión (SPEC-003), calculadas en main
 * sobre los deltas `receivedAtMs − endMs` de los resultados finales.
 */
export interface LatencyStats {
  count: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

/** Resultado de detener la grabación: WAV + transcript (null si no hubo líneas). */
export interface StopResult extends RecordingResult {
  transcriptPath: string | null
  /** Estadísticas de latencia STT; null si no hubo resultados finales. */
  latency: LatencyStats | null
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
    stop: () => Promise<StopResult>
    showInFinder: (filePath: string) => Promise<void>
    onError: (callback: (message: string) => void) => () => void
  }
  transcription: {
    onStatus: (callback: (event: TranscriptionStatusEvent) => void) => () => void
    onResult: (callback: (event: TranscriptResultEvent) => void) => () => void
  }
  window: {
    onCloseRequested: (callback: () => void) => () => void
    confirmClose: () => void
  }
}
