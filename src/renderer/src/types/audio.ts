/**
 * Tipos compartidos del spike de captura de audio (SPEC-001), de la
 * transcripción STT streaming con Deepgram (SPEC-002) y de la grabación
 * asociada a una entrevista (SPEC-015).
 * Este módulo NO debe depender del DOM: lo importan (type-only) main y preload.
 */
import type { Interview } from './domain'

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
  /**
   * Modo degradado sin diarización (SPEC-022): presente (true) solo tras el
   * fallback de conexión sin diarize; ausente = sesión normal. Nunca viaja
   * como false explícito.
   */
  degraded?: boolean
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

/**
 * Registro de consentimiento de grabación (SPEC-019): reconocimiento del aviso
 * legal por el usuario, persistido en el `.transcript.json` para trazabilidad.
 * `acknowledgedAt` es ISO 8601 (momento del inicio de la grabación con el
 * aviso confirmado o previamente desactivado). Grabaciones del spike → null.
 */
export interface TranscriptConsent {
  acknowledgedAt: string
}

/** Resultado de detener la grabación: WAV + transcript (null si no hubo líneas). */
export interface StopResult extends RecordingResult {
  transcriptPath: string | null
  /** Estadísticas de latencia STT; null si no hubo resultados finales. */
  latency: LatencyStats | null
  /**
   * Entrevista actualizada por main tras asociar la grabación (SPEC-015):
   * presente solo si `recording:start` recibió un interviewId; null si la
   * asociación falló (p. ej. entrevista borrada — los archivos se conservan).
   * Opcional para retrocompatibilidad con el flujo del spike (/capture).
   */
  interview?: Interview | null
}

/**
 * Resultado de leer las líneas del `.transcript.json` persistido (SPEC-017):
 * envelope propio porque un archivo ausente o corrupto es un estado esperado
 * de la UI ("No se pudo leer la transcripción"), no una rejection.
 */
export type TranscriptLinesResult =
  { ok: true; lines: TranscriptLine[] } | { ok: false; kind: 'unreadable'; message: string }

/** Contrato del bridge expuesto por el preload en window.api. */
export interface MauryaApi {
  permissions: {
    getStatus: () => Promise<PermissionsSnapshot>
    requestMicrophone: () => Promise<boolean>
    openSettings: (target: PermissionTarget) => Promise<void>
  }
  recording: {
    /**
     * `interviewId` opcional (SPEC-015): asocia la grabación a la entrevista
     * al detener. `consentAcknowledgedAt` opcional (SPEC-019): marca ISO 8601
     * del reconocimiento del aviso de grabación; se persiste como `consent`
     * en el `.transcript.json` (el spike no lo envía → consent null).
     */
    start: (interviewId?: string, consentAcknowledgedAt?: string) => Promise<string>
    writeChunk: (chunk: ArrayBuffer) => void
    stop: () => Promise<StopResult>
    showInFinder: (filePath: string) => Promise<void>
    onError: (callback: (message: string) => void) => () => void
    /**
     * Lee las estadísticas de latencia del `.transcript.json` persistido
     * (SPEC-015, resumen tras recarga); null si no existe o no es legible.
     */
    getTranscriptStats: (transcriptPath: string) => Promise<LatencyStats | null>
    /**
     * Lee las líneas finales del `.transcript.json` persistido (SPEC-017,
     * consulta de la transcripción); ilegible → `{ ok: false, kind: 'unreadable' }`.
     */
    getTranscriptLines: (transcriptPath: string) => Promise<TranscriptLinesResult>
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
