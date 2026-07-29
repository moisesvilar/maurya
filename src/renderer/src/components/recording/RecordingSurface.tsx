import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConsentDialog } from '@/components/recording/ConsentDialog'
import {
  DiscardReasonsDialog,
  type DiscardedQuestionEntry
} from '@/components/recording/DiscardReasonsDialog'
import { DegradedTranscriptionAlert } from '@/components/recording/DegradedTranscriptionAlert'
import { NoKeyAlert } from '@/components/recording/NoKeyAlert'
import { CaptureErrorAlert } from '@/components/spike/CaptureErrorAlert'
import { StopOnCloseDialog } from '@/components/spike/StopOnCloseDialog'
import type { RecordingController } from '@/hooks/useRecordingController'
import { isPermissionError } from '@/lib/permissionError'
import type { Interview } from '@/types/domain'

interface RecordingSurfaceProps {
  controller: RecordingController
  /** Propaga la Interview actualizada tras guardar los motivos (SPEC-039). */
  onInterviewUpdated: (interview: Interview) => void
}

/** Estado del Dialog de motivos (SPEC-039): solo lo que la vista consume. */
interface DiscardDialogState {
  interviewId: string
  entries: DiscardedQuestionEntry[]
}

/**
 * Superficie de grabación bajo la cabecera (SPEC-055, antes «sección Grabación»
 * al final — SPEC-015/030, derogada posicionalmente). Ya no lleva heading ni
 * controles: la sesión (Preparación, Grabando, Grabada) vive en la top bar y la
 * cabecera (RecordingTopBarControls). Aquí solo quedan:
 * - Avisos: error de captura/transcripción, modo degradado (SPEC-022) y «Falta
 *   la key» (SPEC-035) durante la grabación. Los errores de permiso viven arriba
 *   (PermissionErrorAlert, SPEC-049) y se filtran aquí.
 * - Los diálogos del flujo (consentimiento, close-guard, «Preguntas
 *   descartadas») y el efecto de motivos, siempre montados (portales sin footprint).
 * SPEC-059: el detalle de archivo del estado Grabada (latencia + rutas del
 * WAV/transcript) YA NO vive aquí — se fue al final de la página, tras un
 * desplegable plegado por defecto (RecordingTechInfo). Por eso `recorded` salió
 * de `showBlock`: en Grabada sin avisos la superficie no reserva espacio.
 * Cuando no hay nada visible que mostrar (p. ej. Preparación con permisos
 * concedidos) no ocupa espacio.
 */
export function RecordingSurface({
  controller,
  onInterviewUpdated
}: RecordingSurfaceProps): React.ReactElement {
  /** Dialog «Preguntas descartadas» (SPEC-039); null = cerrado. */
  const [discardDialog, setDiscardDialog] = useState<DiscardDialogState | null>(null)
  const {
    capturing,
    error,
    result,
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

  // SPEC-049: los errores de permiso ya no se pintan aquí (viven arriba, en
  // PermissionErrorAlert); el resto de errores de captura sí.
  const hasCaptureError = error !== null && !isPermissionError(error)
  const hasTranscriptionError = transcription.error !== null
  const hasDegraded = capturing && transcription.degraded
  const hasNoKey = capturing && transcription.status === 'no-key'
  const showBlock = hasCaptureError || hasTranscriptionError || hasDegraded || hasNoKey

  return (
    <>
      {showBlock && (
        <div className="flex flex-col gap-4">
          {error !== null && !isPermissionError(error) && <CaptureErrorAlert error={error} />}
          {transcription.error !== null && <CaptureErrorAlert error={transcription.error} />}
          {/* Modo degradado sin diarización (SPEC-022): informativo, persistente
              durante la sesión; el gate `capturing` lo retira al terminar */}
          {hasDegraded && <DegradedTranscriptionAlert />}
          {/* Grabando sin clave, el aviso sigue anclado bajo la cabecera (la top
              bar solo lleva la sesión compacta) */}
          {hasNoKey && <NoKeyAlert />}
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
    </>
  )
}
