import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FolderOpen, Mic, Square } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { AssistantPanel } from '@/components/recording/AssistantPanel'
import { ConsentDialog } from '@/components/recording/ConsentDialog'
import { LatencyRow } from '@/components/recording/LatencyRow'
import { MicSelect } from '@/components/recording/MicSelect'
import { NoKeyAlert } from '@/components/recording/NoKeyAlert'
import { ObjectivesPanel } from '@/components/recording/ObjectivesPanel'
import { PermissionBadges } from '@/components/recording/PermissionBadges'
import { TranscriptArea } from '@/components/recording/TranscriptArea'
import { TranscriptionStatusBadge } from '@/components/recording/transcriptionStatusBadge'
import { CaptureErrorAlert } from '@/components/spike/CaptureErrorAlert'
import { LevelMeter } from '@/components/spike/LevelMeter'
import { StopOnCloseDialog } from '@/components/spike/StopOnCloseDialog'
import { useAssistant } from '@/hooks/useAssistant'
import { useAudioCapture } from '@/hooks/useAudioCapture'
import { useAudioDevices } from '@/hooks/useAudioDevices'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { useConsentPreference } from '@/hooks/useConsentPreference'
import { usePermissions } from '@/hooks/usePermissions'
import { useTranscription } from '@/hooks/useTranscription'
import { cn } from '@/lib/utils'
import type { LatencyStats } from '@/types/audio'
import type { Interview } from '@/types/domain'

interface RecordingSectionProps {
  interview: Interview
  onInterviewUpdated: (interview: Interview) => void
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Sección Grabación del detalle de entrevista (SPEC-015): lleva el motor del
 * spike al flujo real con tres estados DERIVADOS (sin máquina propia):
 * Grabando (status del hook ∈ starting/recording/stopping), Grabada
 * (interview.wavPath presente y sin "Nueva grabación" solicitada) y
 * Preparación (el resto). La asociación wavPath/transcriptPath/status ocurre
 * en main dentro de recording:stop, por lo que el auto-guardado al navegar
 * fuera (cleanup de desmontaje con stopRef) funciona aunque el componente ya
 * no esté montado; los setState del hook en desmontado son no-op y el Toast
 * "Grabación guardada" es visible por el Toaster global.
 */
export function RecordingSection({
  interview,
  onInterviewUpdated
}: RecordingSectionProps): React.ReactElement {
  const interviewId = interview.id
  const { permissions, refresh } = usePermissions()
  const { devices, selectedDeviceId, setSelectedDeviceId } = useAudioDevices()
  const {
    status: transcriptionStatus,
    lines,
    partials,
    error: transcriptionError,
    reset: resetTranscription
  } = useTranscription()
  const {
    state: assistantState,
    suggestion: assistantSuggestion,
    objectivesMet,
    error: assistantError,
    vote: assistantVote,
    usage: assistantUsage,
    pauseLimitUsd: assistantPauseLimitUsd,
    sendFeedback,
    resume: resumeAssistant,
    reset: resetAssistant
  } = useAssistant()

  const [newRecordingRequested, setNewRecordingRequested] = useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
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

  // Estados derivados (plan §3): Grabando > Grabada > Preparación
  const capturing = status === 'starting' || status === 'recording' || status === 'stopping'
  const recorded = !capturing && interview.wavPath !== null && !newRecordingRequested
  const displayLatency = result?.latency ?? persistedLatency

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">Grabación</h3>

      {error !== null && <CaptureErrorAlert error={error} />}
      {transcriptionError !== null && <CaptureErrorAlert error={transcriptionError} />}

      {/* Estado 2 — Grabando */}
      {capturing && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span
              className={cn(
                'font-mono text-4xl tabular-nums',
                status !== 'recording' && 'text-muted-foreground'
              )}
            >
              {formatElapsed(elapsedSeconds)}
            </span>
            <Button
              variant="destructive"
              onClick={() => void stop()}
              disabled={status === 'stopping'}
            >
              <Square /> Detener
            </Button>
            <TranscriptionStatusBadge status={transcriptionStatus} />
          </div>
          {/* Asistente (SPEC-016): entre la fila superior y los medidores —
              lo que el entrevistador debe ver de un vistazo */}
          <AssistantPanel
            state={assistantState}
            suggestion={assistantSuggestion}
            error={assistantError}
            vote={assistantVote}
            usage={assistantUsage}
            pauseLimitUsd={assistantPauseLimitUsd}
            onVote={sendFeedback}
            onResume={resumeAssistant}
          />
          {interview.objectives.length > 0 && (
            <ObjectivesPanel objectives={interview.objectives} objectivesMet={objectivesMet} />
          )}
          <div className="space-y-3">
            <LevelMeter label="Micrófono" value={levels.microphone} />
            <LevelMeter label="Sistema" value={levels.system} />
          </div>
          <TranscriptArea status={transcriptionStatus} lines={lines} partials={partials} />
          {transcriptionStatus === 'no-key' && <NoKeyAlert />}
          <MicSelect
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            disabled
          />
        </div>
      )}

      {/* Estado 3 — Grabada (resumen persistente) */}
      {recorded && (
        <div className="flex flex-col gap-3">
          {result !== null && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Duración</span>
              <span className="font-mono tabular-nums">
                {formatElapsed(Math.round(result.durationSeconds))}
              </span>
            </div>
          )}
          {displayLatency !== null && <LatencyRow latency={displayLatency} />}
          <p className="break-all font-mono text-sm">{interview.wavPath}</p>
          {interview.transcriptPath !== null && (
            <p className="break-all font-mono text-sm">{interview.transcriptPath}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {/* Ambos archivos comparten carpeta: un solo botón para la carpeta */}
            <Button variant="outline" onClick={handleShowInFinder}>
              <FolderOpen /> Mostrar en Finder
            </Button>
            <Button variant="outline" onClick={() => setConfirmOverwrite(true)}>
              <Mic /> Nueva grabación
            </Button>
          </div>
        </div>
      )}

      {/* Estado 1 — Preparación */}
      {!capturing && !recorded && (
        <div className="flex flex-col gap-4">
          <PermissionBadges permissions={permissions} />
          <MicSelect
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            disabled={false}
          />
          <div>
            <Button onClick={handleStart}>
              <Mic /> Iniciar grabación
            </Button>
          </div>
        </div>
      )}

      <ConsentDialog
        open={consentDialogOpen}
        onCancel={handleConsentCancel}
        onConfirm={handleConsentConfirm}
      />

      <StopOnCloseDialog
        open={closeDialogOpen}
        onCancel={cancelClose}
        onConfirm={() => void confirmClose()}
      />

      <AlertDialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sobrescribir grabación</AlertDialogTitle>
            <AlertDialogDescription>
              La grabación y transcripción actuales se sustituirán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOverwrite(false)
                // Los archivos antiguos NO se borran del disco (MVP): quedan
                // huérfanos en recordings/ hasta que la nueva grabación
                // sustituya las referencias al detener
                setNewRecordingRequested(true)
              }}
            >
              Sobrescribir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
