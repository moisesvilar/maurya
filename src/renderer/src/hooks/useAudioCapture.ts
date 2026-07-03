import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioLevels, CaptureError, CaptureStatus, RecordingResult } from '@/types/audio'
import {
  acquireMicrophoneStream,
  acquireSystemAudioStream,
  stopStream
} from '@/services/captureService'
import { getPermissionsStatus, requestMicrophoneAccess } from '@/services/permissionsService'
import { WavRecorderService } from '@/services/wavRecorderService'

const UI_REFRESH_INTERVAL_MS = 100

const MIC_PERMISSION_ERROR: CaptureError = {
  kind: 'microphone-permission',
  message:
    'El permiso de micrófono no está concedido. Concédelo en Ajustes del Sistema → Privacidad y seguridad → Micrófono.'
}

const SYSTEM_PERMISSION_ERROR: CaptureError = {
  kind: 'system-audio-permission',
  message:
    'El permiso de captura de audio del sistema no está concedido. Concédelo en Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla y audio del sistema.'
}

const DEVICE_DISCONNECTED_ERROR: CaptureError = {
  kind: 'device-disconnected',
  message:
    'El dispositivo de entrada se ha desconectado. La captura se ha detenido y se ha conservado lo grabado hasta ese momento.'
}

export interface UseAudioCaptureResult {
  status: CaptureStatus
  elapsedSeconds: number
  levels: AudioLevels
  error: CaptureError | null
  result: RecordingResult | null
  start: (deviceId: string) => Promise<void>
  stop: () => Promise<RecordingResult | null>
  clearError: () => void
}

/**
 * Máquina de estados de la captura dual. `onSaved` se invoca con el resultado
 * cuando una grabación termina de guardarse por acción del usuario (no cuando
 * la detiene un error, que se comunica vía `error` conservando el resultado).
 */
export function useAudioCapture(onSaved: (result: RecordingResult) => void): UseAudioCaptureResult {
  const [status, setStatus] = useState<CaptureStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [levels, setLevels] = useState<AudioLevels>({ microphone: 0, system: 0 })
  const [error, setError] = useState<CaptureError | null>(null)
  const [result, setResult] = useState<RecordingResult | null>(null)

  const recorderRef = useRef<WavRecorderService | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const systemStreamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<number | null>(null)
  const stoppingRef = useRef(false)
  const onSavedRef = useRef(onSaved)
  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  const releaseResources = useCallback((): void => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    stopStream(micStreamRef.current)
    stopStream(systemStreamRef.current)
    micStreamRef.current = null
    systemStreamRef.current = null
    recorderRef.current = null
  }, [])

  const finalize = useCallback(
    async (cause: CaptureError | null): Promise<RecordingResult | null> => {
      const recorder = recorderRef.current
      if (recorder === null || stoppingRef.current) {
        return null
      }
      stoppingRef.current = true
      setStatus('stopping')
      try {
        await recorder.stop()
      } catch {
        // el cierre del grafo nunca debe impedir guardar el archivo
      }
      let saved: RecordingResult | null = null
      try {
        saved = await window.api.recording.stop()
        setResult(saved)
      } catch (stopError) {
        setError({
          kind: 'file-write',
          message: `Error al finalizar el archivo de grabación: ${String(stopError)}`
        })
      }
      releaseResources()
      setLevels({ microphone: 0, system: 0 })
      setStatus('idle')
      stoppingRef.current = false
      if (cause !== null) {
        setError(cause)
      } else if (saved !== null) {
        onSavedRef.current(saved)
      }
      return saved
    },
    [releaseResources]
  )

  const start = useCallback(
    async (deviceId: string): Promise<void> => {
      if (recorderRef.current !== null || status !== 'idle') {
        return
      }
      setError(null)
      setResult(null)
      setElapsedSeconds(0)
      setStatus('starting')

      let micStream: MediaStream | null = null
      let systemStream: MediaStream | null = null
      try {
        const snapshot = await getPermissionsStatus()

        let micGranted = snapshot?.microphone === 'granted'
        if (!micGranted && snapshot?.microphone === 'not-determined') {
          // Único punto donde se dispara el prompt TCC de micrófono
          micGranted = await requestMicrophoneAccess()
        }
        if (!micGranted) {
          setError(MIC_PERMISSION_ERROR)
          setStatus('idle')
          return
        }
        if (snapshot?.systemAudio === 'denied' || snapshot?.systemAudio === 'restricted') {
          setError(SYSTEM_PERMISSION_ERROR)
          setStatus('idle')
          return
        }

        try {
          micStream = await acquireMicrophoneStream(deviceId)
        } catch {
          setError(MIC_PERMISSION_ERROR)
          setStatus('idle')
          return
        }

        try {
          // Si el TCC estaba not-determined, este intento dispara el prompt del SO
          systemStream = await acquireSystemAudioStream()
        } catch {
          systemStream = null
        }
        if (systemStream === null || systemStream.getAudioTracks().length === 0) {
          stopStream(micStream)
          stopStream(systemStream)
          setError(SYSTEM_PERMISSION_ERROR)
          setStatus('idle')
          return
        }

        await window.api.recording.start()
        const recorder = new WavRecorderService()
        await recorder.start(micStream, systemStream)

        recorderRef.current = recorder
        micStreamRef.current = micStream
        systemStreamRef.current = systemStream

        const onTrackEnded = (): void => {
          void finalize(DEVICE_DISCONNECTED_ERROR)
        }
        micStream.getAudioTracks().forEach((track) => {
          track.addEventListener('ended', onTrackEnded)
        })
        systemStream.getAudioTracks().forEach((track) => {
          track.addEventListener('ended', onTrackEnded)
        })

        intervalRef.current = window.setInterval(() => {
          const active = recorderRef.current
          if (active !== null) {
            setElapsedSeconds(Math.floor(active.durationSeconds))
            setLevels(active.getLevels())
          }
        }, UI_REFRESH_INTERVAL_MS)

        setStatus('recording')
      } catch (startError) {
        stopStream(micStream)
        stopStream(systemStream)
        releaseResources()
        setError({
          kind: 'capture-failure',
          message: `No se pudo iniciar la captura: ${String(startError)}`
        })
        setStatus('idle')
      }
    },
    [status, finalize, releaseResources]
  )

  const stop = useCallback((): Promise<RecordingResult | null> => finalize(null), [finalize])

  const clearError = useCallback((): void => {
    setError(null)
  }, [])

  // Errores de escritura reportados por main durante el streaming
  useEffect(() => {
    return window.api.recording.onError((message) => {
      void finalize({ kind: 'file-write', message })
    })
  }, [finalize])

  return { status, elapsedSeconds, levels, error, result, start, stop, clearError }
}
