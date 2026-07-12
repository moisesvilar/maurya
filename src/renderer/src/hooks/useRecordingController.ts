import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAssistant } from '@/hooks/useAssistant'
import { useAudioCapture } from '@/hooks/useAudioCapture'
import { useAudioDevices } from '@/hooks/useAudioDevices'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { useConsentPreference } from '@/hooks/useConsentPreference'
import { usePermissions } from '@/hooks/usePermissions'
import { useTranscription } from '@/hooks/useTranscription'
import type { TranscriptLineView, TranscriptPartials } from '@/hooks/useTranscription'
import type { AssistantState, AssistantSuggestion, AssistantVote } from '@/types/assistant'
import type {
  AudioInputDevice,
  AudioLevels,
  CaptureError,
  CaptureStatus,
  LatencyStats,
  PermissionsSnapshot,
  StopResult,
  TranscriptionStatus
} from '@/types/audio'
import type { AiUsage, Interview } from '@/types/domain'
import type { LlmError } from '@/types/llm'

/** Estado de la transcripción en vivo expuesto por el controller (lectura). */
export interface RecordingControllerTranscription {
  status: TranscriptionStatus
  lines: TranscriptLineView[]
  partials: TranscriptPartials
  error: CaptureError | null
  degraded: boolean
}

/** Estado del asistente proactivo expuesto por el controller. */
export interface RecordingControllerAssistant {
  state: AssistantState
  suggestion: AssistantSuggestion | null
  error: LlmError | null
  vote: AssistantVote | null
  usage: AiUsage | null
  pauseLimitUsd: number | null
  sendFeedback: (vote: AssistantVote) => void
  resume: () => void
}

/**
 * Contrato del controller de grabación (SPEC-034): única fuente de verdad del
 * estado de la grabación (permisos, dispositivos, captura, consentimiento,
 * close guard, transcripción y asistente) compartida entre la top bar, la
 * cabecera y la sección Grabación de la captura. Los resets internos
 * (transcripción/asistente/error) son privados: solo los usa startCapture.
 */
export interface RecordingController {
  permissions: PermissionsSnapshot | null
  devices: AudioInputDevice[]
  selectedDeviceId: string
  setSelectedDeviceId: (deviceId: string) => void
  /** «Iniciar grabación»: consentimiento SPEC-019 o arranque directo. */
  handleStart: () => void
  capturing: boolean
  recorded: boolean
  status: CaptureStatus
  elapsedSeconds: number
  levels: AudioLevels
  error: CaptureError | null
  result: StopResult | null
  stop: () => Promise<StopResult | null>
  displayLatency: LatencyStats | null
  /** «Nueva grabación» confirmada: vuelve al estado Preparación. */
  requestNewRecording: () => void
  handleShowInFinder: () => void
  transcription: RecordingControllerTranscription
  assistant: RecordingControllerAssistant
  consentDialogOpen: boolean
  handleConsentCancel: () => void
  handleConsentConfirm: (dontShowAgain: boolean) => void
  closeDialogOpen: boolean
  cancelClose: () => void
  confirmClose: () => Promise<void>
}

/**
 * Motor de la sección Grabación (SPEC-015/019/030) extraído de
 * RecordingSection (SPEC-034) para poder crearlo también desde el detalle de
 * captura y compartirlo con la top bar y la cabecera. Tres estados DERIVADOS
 * (sin máquina propia): Grabando (status del hook ∈ starting/recording/
 * stopping), Grabada (interview.wavPath presente y sin "Nueva grabación"
 * solicitada) y Preparación (el resto). La asociación wavPath/transcriptPath/
 * status ocurre en main dentro de recording:stop, por lo que el auto-guardado
 * al navegar fuera (cleanup de desmontaje con stopRef) funciona aunque el
 * componente ya no esté montado; los setState del hook en desmontado son
 * no-op y el Toast "Grabación guardada" es visible por el Toaster global.
 */
export function useRecordingController(
  interview: Interview,
  onInterviewUpdated: (interview: Interview) => void
): RecordingController {
  const interviewId = interview.id
  const { permissions, refresh } = usePermissions()
  const { devices, selectedDeviceId, setSelectedDeviceId } = useAudioDevices()
  const {
    status: transcriptionStatus,
    lines,
    partials,
    error: transcriptionError,
    degraded: transcriptionDegraded,
    reset: resetTranscription
  } = useTranscription()
  const {
    state: assistantState,
    suggestion: assistantSuggestion,
    error: assistantError,
    vote: assistantVote,
    usage: assistantUsage,
    pauseLimitUsd: assistantPauseLimitUsd,
    sendFeedback,
    resume: resumeAssistant,
    reset: resetAssistant
  } = useAssistant()

  const [newRecordingRequested, setNewRecordingRequested] = useState(false)
  /** Diálogo "Aviso de grabación" (SPEC-019), previo al arranque salvo preferencia activa. */
  const [consentDialogOpen, setConsentDialogOpen] = useState(false)
  const { dismissed: consentDismissed, persistDismiss: persistConsentDismiss } =
    useConsentPreference()
  /** Latencia leída del .transcript.json persistido (Estado 3 tras recarga). */
  const [persistedLatency, setPersistedLatency] = useState<LatencyStats | null>(null)

  // Toast al guardarse por acción del usuario (Detener, auto-guardado al
  // navegar, close guard); la parada por error muestra el Alert de causa.
  const handleSaved = useCallback((): void => {
    toast('Grabación guardada')
  }, [])

  const { status, elapsedSeconds, levels, error, result, start, stop, clearError } =
    useAudioCapture(handleSaved)

  const { closeDialogOpen, cancelClose, confirmClose } = useCloseGuard(stop)

  // La identidad del callback del padre no debe re-disparar los efectos
  const onInterviewUpdatedRef = useRef(onInterviewUpdated)
  useEffect(() => {
    onInterviewUpdatedRef.current = onInterviewUpdated
  }, [onInterviewUpdated])

  // Cualquier parada con resultado (Detener, desconexión, close guard) refleja
  // la entrevista asociada por main; fallback defensivo: refetch si viene null.
  // Diferido para no hacer setState síncrono dentro del cuerpo del efecto
  // (patrón usePermissions / react-hooks/set-state-in-effect).
  useEffect(() => {
    if (result === null) {
      return
    }
    const timer = window.setTimeout(() => {
      setNewRecordingRequested(false)
      setPersistedLatency(null)
      if (result.interview !== null && result.interview !== undefined) {
        onInterviewUpdatedRef.current(result.interview)
        return
      }
      void window.api.db.getInterview(interviewId).then((refetched) => {
        if (refetched.ok) {
          onInterviewUpdatedRef.current(refetched.data)
        }
      })
    }, 0)
    return (): void => {
      window.clearTimeout(timer)
    }
  }, [result, interviewId])

  // Resumen tras recarga: sin result en memoria, la latencia se lee del
  // transcript persistido (canal recording:get-transcript-stats)
  const transcriptPath = interview.transcriptPath
  useEffect(() => {
    if (result !== null || transcriptPath === null) {
      return
    }
    let cancelled = false
    void window.api.recording.getTranscriptStats(transcriptPath).then((stats) => {
      if (!cancelled) {
        setPersistedLatency(stats)
      }
    })
    return (): void => {
      cancelled = true
    }
  }, [result, transcriptPath])

  // Auto-guardado al desmontar (navegar fuera del detalle): detener-y-guardar
  // sin diálogo; finalize es idempotente (stoppingRef) y no-op si no hay
  // grabación activa. Hueco conocido: desmontar durante 'starting' (ms) deja
  // la grabación huérfana en main, recuperable por su guard en el próximo start.
  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  }, [stop])
  useEffect(() => {
    return (): void => {
      void stopRef.current()
    }
  }, [])

  /**
   * Arranque real de la captura (flujo SPEC-015 intacto). El timestamp del
   * consentimiento (SPEC-019) se genera aquí, en el renderer, en el momento
   * del inicio con el aviso confirmado o previamente desactivado; viaja a main
   * con recording:start y se persiste en el transcript.json al detener.
   */
  const startCapture = useCallback((): void => {
    clearError()
    resetTranscription()
    resetAssistant()
    // El bloqueo por permisos no concedidos lo aplica el propio hook (Alert
    // destructive con los literales del spike, sin arrancar la captura)
    void start(selectedDeviceId, interviewId, new Date().toISOString()).then(() => {
      // El intento de inicio puede haber disparado prompts TCC: refrescar Badges
      void refresh()
    })
  }, [
    clearError,
    resetTranscription,
    resetAssistant,
    start,
    selectedDeviceId,
    interviewId,
    refresh
  ])

  // "Iniciar grabación" (SPEC-019): con la preferencia de no mostrar activa
  // arranca directamente; si no, abre el aviso y la grabación espera
  const handleStart = useCallback((): void => {
    if (consentDismissed) {
      startCapture()
      return
    }
    setConsentDialogOpen(true)
  }, [consentDismissed, startCapture])

  // Cancelar/Escape/click fuera: cierra sin arrancar y sin persistir nada
  const handleConsentCancel = useCallback((): void => {
    setConsentDialogOpen(false)
  }, [])

  // Confirmación informada: persiste la casilla SOLO aquí y arranca
  const handleConsentConfirm = useCallback(
    (dontShowAgain: boolean): void => {
      if (dontShowAgain) {
        persistConsentDismiss()
      }
      setConsentDialogOpen(false)
      startCapture()
    },
    [persistConsentDismiss, startCapture]
  )

  const handleShowInFinder = useCallback((): void => {
    if (interview.wavPath !== null) {
      void window.api.recording.showInFinder(interview.wavPath)
    }
  }, [interview.wavPath])

  // "Nueva grabación" confirmada (el AlertDialog de sobrescritura vive en la
  // sección): los archivos antiguos NO se borran del disco (MVP), quedan
  // huérfanos en recordings/ hasta que la nueva grabación sustituya las
  // referencias al detener
  const requestNewRecording = useCallback((): void => {
    setNewRecordingRequested(true)
  }, [])

  // Estados derivados (plan §3): Grabando > Grabada > Preparación
  const capturing = status === 'starting' || status === 'recording' || status === 'stopping'
  const recorded = !capturing && interview.wavPath !== null && !newRecordingRequested
  const displayLatency = result?.latency ?? persistedLatency

  return {
    permissions,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    handleStart,
    capturing,
    recorded,
    status,
    elapsedSeconds,
    levels,
    error,
    result,
    stop,
    displayLatency,
    requestNewRecording,
    handleShowInFinder,
    transcription: {
      status: transcriptionStatus,
      lines,
      partials,
      error: transcriptionError,
      degraded: transcriptionDegraded
    },
    assistant: {
      state: assistantState,
      suggestion: assistantSuggestion,
      error: assistantError,
      vote: assistantVote,
      usage: assistantUsage,
      pauseLimitUsd: assistantPauseLimitUsd,
      sendFeedback,
      resume: resumeAssistant
    },
    consentDialogOpen,
    handleConsentCancel,
    handleConsentConfirm,
    closeDialogOpen,
    cancelClose,
    confirmClose
  }
}
