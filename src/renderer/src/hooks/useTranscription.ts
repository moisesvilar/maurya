import { useCallback, useEffect, useState } from 'react'
import type {
  CaptureError,
  TranscriptChannel,
  TranscriptLine,
  TranscriptionStatus
} from '@/types/audio'

/** Línea final con el offset ya calculado por main para el timestamp mm:ss. */
export interface TranscriptLineView extends TranscriptLine {
  offsetSeconds: number
}

/** Texto parcial en curso por canal (Deepgram multichannel: uno por canal). */
export type TranscriptPartials = Record<TranscriptChannel, string>

const EMPTY_PARTIALS: TranscriptPartials = { mic: '', system: '' }

export interface UseTranscriptionResult {
  status: TranscriptionStatus
  lines: TranscriptLineView[]
  partials: TranscriptPartials
  error: CaptureError | null
  reset: () => void
}

/**
 * Estado de la transcripción en vivo (SPEC-002): suscrito a los eventos que
 * emite el main process. `reset()` debe llamarse al iniciar una captura nueva.
 */
export function useTranscription(): UseTranscriptionResult {
  const [status, setStatus] = useState<TranscriptionStatus>('inactive')
  const [lines, setLines] = useState<TranscriptLineView[]>([])
  const [partials, setPartials] = useState<TranscriptPartials>(EMPTY_PARTIALS)
  const [error, setError] = useState<CaptureError | null>(null)

  useEffect(() => {
    return window.api.transcription.onStatus((event) => {
      setStatus(event.status)
      if (event.error !== undefined) {
        setError(event.error)
      } else if (event.status === 'active') {
        // Reconexión con éxito: se limpia el Alert de error
        setError(null)
      }
    })
  }, [])

  useEffect(() => {
    return window.api.transcription.onResult((event) => {
      if (event.isFinal) {
        setPartials((prev) => ({ ...prev, [event.channel]: '' }))
        if (event.text !== '') {
          setLines((prev) => [
            ...prev,
            {
              channel: event.channel,
              text: event.text,
              startMs: event.startMs,
              endMs: event.endMs,
              receivedAtMs: event.receivedAtMs,
              speaker: event.speaker,
              offsetSeconds: event.offsetSeconds
            }
          ])
        }
      } else {
        setPartials((prev) => ({ ...prev, [event.channel]: event.text }))
      }
    })
  }, [])

  const reset = useCallback((): void => {
    setStatus('inactive')
    setLines([])
    setPartials(EMPTY_PARTIALS)
    setError(null)
  }, [])

  return { status, lines, partials, error, reset }
}
