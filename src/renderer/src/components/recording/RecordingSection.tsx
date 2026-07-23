import React, { useEffect, useRef, useState } from 'react'
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
import { ConsentDialog } from '@/components/recording/ConsentDialog'
import {
  DiscardReasonsDialog,
  type DiscardedQuestionEntry
} from '@/components/recording/DiscardReasonsDialog'
import { DegradedTranscriptionAlert } from '@/components/recording/DegradedTranscriptionAlert'
import { LatencyRow } from '@/components/recording/LatencyRow'
import { MicSelect } from '@/components/recording/MicSelect'
import { NoKeyAlert } from '@/components/recording/NoKeyAlert'
import { PermissionBadges } from '@/components/recording/PermissionBadges'
import { TranscriptArea } from '@/components/recording/TranscriptArea'
import { TranscriptionStatusBadge } from '@/components/recording/transcriptionStatusBadge'
import { CaptureErrorAlert } from '@/components/spike/CaptureErrorAlert'
import { LevelMeter } from '@/components/spike/LevelMeter'
import { StopOnCloseDialog } from '@/components/spike/StopOnCloseDialog'
import { useRecordingController } from '@/hooks/useRecordingController'
import type { RecordingController } from '@/hooks/useRecordingController'
import { formatElapsed } from '@/lib/formatElapsed'
import { cn } from '@/lib/utils'
import type { Interview } from '@/types/domain'

interface RecordingSectionProps {
  interview: Interview
  onInterviewUpdated: (interview: Interview) => void
  /**
   * Controller externo (SPEC-034, variante captura; SPEC-041 también en la
   * entrevista): lo crea la página para compartirlo con el panel del
   * asistente (y en la captura con la top bar y la cabecera). Sin él, la
   * sección crea el suyo propio y no cambia nada.
   */
  controller?: RecordingController
  /**
   * Variante de la superficie (SPEC-041): con controller externo ya no se
   * puede inferir de su presencia — default 'capture' (compatibilidad con
   * CaptureDetailPage); sin controller siempre es 'interview'.
   */
  variant?: 'interview' | 'capture'
}

/**
 * Sección Grabación del detalle de entrevista (SPEC-015): lleva el motor del
 * spike al flujo real con tres estados DERIVADOS (sin máquina propia):
 * Grabando (status del hook ∈ starting/recording/stopping), Grabada
 * (interview.wavPath presente y sin "Nueva grabación" solicitada) y
 * Preparación (el resto). SPEC-034: el motor vive en useRecordingController;
 * en modo entrevista lo crea la propia sección (comportamiento idéntico) y en
 * modo captura llega por prop desde CaptureDetailPage. El branch es legal: los
 * hooks viven en los hijos y la prop `controller` nunca alterna
 * definido↔undefined durante la vida del componente.
 */
export function RecordingSection(props: RecordingSectionProps): React.ReactElement {
  if (props.controller !== undefined) {
    return (
      <RecordingSectionView
        controller={props.controller}
        interview={props.interview}
        variant={props.variant ?? 'capture'}
        onInterviewUpdated={props.onInterviewUpdated}
      />
    )
  }
  return (
    <SelfControlledRecordingSection
      interview={props.interview}
      onInterviewUpdated={props.onInterviewUpdated}
    />
  )
}

interface SelfControlledRecordingSectionProps {
  interview: Interview
  onInterviewUpdated: (interview: Interview) => void
}

/** Variante entrevista (SPEC-015): la sección crea y posee su controller. */
function SelfControlledRecordingSection({
  interview,
  onInterviewUpdated
}: SelfControlledRecordingSectionProps): React.ReactElement {
  const controller = useRecordingController(interview, onInterviewUpdated)
  return (
    <RecordingSectionView
      controller={controller}
      interview={interview}
      variant="interview"
      onInterviewUpdated={onInterviewUpdated}
    />
  )
}

interface RecordingSectionViewProps {
  controller: RecordingController
  interview: Interview
  variant: 'interview' | 'capture'
  /** Propaga la Interview actualizada tras guardar los motivos (SPEC-039). */
  onInterviewUpdated: (interview: Interview) => void
}

/** Estado del Dialog de motivos (SPEC-039): solo lo que la vista consume. */
interface DiscardDialogState {
  interviewId: string
  entries: DiscardedQuestionEntry[]
}

/**
 * JSX de la sección. Condicionales por variante: los bloques «Estado 1 —
 * Preparación» y «Estado 2 — Grabando» solo se pintan en modo entrevista — en
 * la captura la preparación vive en la top bar y la cabecera (SPEC-034) y la
 * sesión en vivo completa también sube a la top bar (extensión de SPEC-034:
 * cronómetro, Detener, estado y medidores en CaptureTopBarControls), por lo
 * que la sección entera — heading incluido — desaparece del final mientras se
 * graba y solo persisten los avisos (errores, degradado, sin key). Los Alerts
 * de error y los diálogos (consentimiento, close guard, sobrescribir) se
 * renderizan en ambas variantes.
 */
function RecordingSectionView({
  controller,
  interview,
  variant,
  onInterviewUpdated
}: RecordingSectionViewProps): React.ReactElement {
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  /** Dialog «Preguntas descartadas» (SPEC-039); null = cerrado. */
  const [discardDialog, setDiscardDialog] = useState<DiscardDialogState | null>(null)
  const {
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
    transcription,
    consentDialogOpen,
    handleConsentCancel,
    handleConsentConfirm,
    closeDialogOpen,
    cancelClose,
    confirmClose
  } = controller

  // SPEC-039: el Dialog de motivos se abre UNA sola vez por parada (el ref de
  // identidad marca el resultado ya tratado; al navegar de vuelta no hay
  // result en memoria y no reaparece) y solo con ≥1 pregunta descartada.
  // Diferido para no hacer setState síncrono dentro del cuerpo del efecto
  // (patrón useRecordingController / react-hooks/set-state-in-effect).
  const handledStopRef = useRef<unknown>(null)
  useEffect(() => {
    if (result === null || handledStopRef.current === result) {
      return
    }
    handledStopRef.current = result
    const stoppedInterview = result.interview ?? null
    if (stoppedInterview === null) {
      return
    }
    const entries: DiscardedQuestionEntry[] = (stoppedInterview.questionOutcomes ?? [])
      .map((outcome, index) => ({ index, question: outcome.question, outcome: outcome.outcome }))
      .filter((entry) => entry.outcome === 'discarded')
      .map((entry) => ({ index: entry.index, question: entry.question }))
    if (entries.length === 0) {
      return
    }
    const timer = window.setTimeout(() => {
      setDiscardDialog({ interviewId: stoppedInterview.id, entries })
    }, 0)
    return (): void => {
      window.clearTimeout(timer)
    }
  }, [result])

  // «Guardar motivos» → persistencia atómica en main + Toast + propagación de
  // la Interview actualizada. «Omitir»/Escape/cerrar → sin llamada (los
  // outcomes ya están guardados; solo se omiten los motivos).
  const handleDiscardReasonsSave = (reasons: Array<{ index: number; reason: string }>): void => {
    if (discardDialog === null) {
      return
    }
    const interviewId = discardDialog.interviewId
    setDiscardDialog(null)
    void window.api.db.setInterviewDiscardReasons(interviewId, reasons).then((response) => {
      if (response.ok) {
        toast('Motivos guardados')
        onInterviewUpdated(response.data)
      }
    })
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Grabando una captura la sesión vive en la top bar: sin heading aquí
          (los avisos de abajo se explican solos) */}
      {!(variant === 'capture' && capturing) && (
        <h3 className="text-lg font-semibold">Grabación</h3>
      )}

      {error !== null && <CaptureErrorAlert error={error} />}
      {transcription.error !== null && <CaptureErrorAlert error={transcription.error} />}
      {/* Modo degradado sin diarización (SPEC-022): informativo, persistente
          durante la sesión; el gate `capturing` lo retira al terminar */}
      {capturing && transcription.degraded && <DegradedTranscriptionAlert />}

      {/* Estado 2 — Grabando: solo en el detalle de entrevista clásico; en la
          captura la sesión en vivo (cronómetro, Detener, estado, medidores)
          vive en la top bar (CaptureTopBarControls, extensión de SPEC-034) */}
      {capturing && variant === 'interview' && (
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
            <TranscriptionStatusBadge status={transcription.status} />
          </div>
          {/* SPEC-041: el panel del asistente ya no vive aquí — las páginas
              lo pintan arriba (AssistantLiveSection, entre objetivos y
              Nota/Guión) mientras se graba. La Grabación conserva cronómetro,
              Detener, medidores y la transcripción en vivo (SPEC-035: en la
              captura esa área nunca se pinta). */}
          {/* SPEC-025: el seguimiento en vivo de objetivos se pinta en la
              sección "Objetivos" superior del detalle, no aquí */}
          <div className="space-y-3">
            <LevelMeter label="Micrófono" value={levels.microphone} />
            <LevelMeter label="Sistema" value={levels.system} />
          </div>
          <TranscriptArea
            status={transcription.status}
            lines={transcription.lines}
            partials={transcription.partials}
          />
          {transcription.status === 'no-key' && <NoKeyAlert />}
          <MicSelect
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            disabled
          />
        </div>
      )}

      {/* Grabando una captura, el aviso de key ausente sigue anclado aquí
          (la top bar solo lleva la sesión compacta) */}
      {capturing && variant === 'capture' && transcription.status === 'no-key' && <NoKeyAlert />}

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

      {/* Estado 1 — Preparación: solo en el detalle de entrevista clásico; en
          la captura estos controles viven en la top bar y la cabecera (SPEC-034) */}
      {variant === 'interview' && !capturing && !recorded && (
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

      {/* Motivos de las preguntas descartadas (SPEC-039): una vez por parada */}
      <DiscardReasonsDialog
        open={discardDialog !== null}
        entries={discardDialog?.entries ?? []}
        onSave={handleDiscardReasonsSave}
        onSkip={() => setDiscardDialog(null)}
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
                requestNewRecording()
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
