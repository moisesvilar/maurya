import React from 'react'
import { DetachWindowButton } from '@/components/detached/DetachWindowButton'
import { AssistantPanel } from '@/components/recording/AssistantPanel'
import type { RecordingController } from '@/hooks/useRecordingController'

interface AssistantLiveSectionProps {
  controller: RecordingController
  /**
   * Entrevista a la que pertenece la sesión (SPEC-059): la necesita el botón
   * de desacople y el controller no la expone. REQUERIDA a propósito: un
   * olvido de cableado debe romper el typecheck, no esconder el botón.
   */
  interviewId: string
}

/**
 * Panel del asistente en su ubicación de página (SPEC-041): durante la
 * grabación vive arriba — en el detalle de entrevista entre «Objetivos» y
 * Nota/Guión; en el de captura inmediatamente encima de Nota/Guión (regla de
 * densidad §8.3: lo más consultado arriba). Fuera de la grabación no se
 * renderiza, como hasta ahora. Componente compartido para no duplicar el
 * cableado en las dos páginas: el AssistantPanel recibe EXACTAMENTE las mismas
 * props que recibía dentro de RecordingSectionView (controller.assistant.*).
 * SPEC-059: la sección gana una fila de cabecera con el botón que abre el
 * asistente en su propia ventana. En `no-key` va deshabilitado con Tooltip
 * explicativo: una ventana solo-asistente sin clave únicamente mostraría el
 * aviso de clave.
 */
export function AssistantLiveSection({
  controller,
  interviewId
}: AssistantLiveSectionProps): React.ReactElement | null {
  if (!controller.capturing) {
    return null
  }
  const { assistant } = controller
  return (
    <section data-testid="assistant-live-section" className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        <DetachWindowButton
          component="assistant"
          interviewId={interviewId}
          testId="detach-assistant-button"
          ariaLabel="Abrir asistente en ventana"
          tooltip="Asistente en una ventana aparte"
          disabledReason={
            assistant.state === 'no-key'
              ? 'Configura tu clave de Anthropic en Ajustes para abrir el asistente en una ventana'
              : null
          }
        />
      </div>
      <AssistantPanel
        state={assistant.state}
        queue={assistant.queue}
        error={assistant.error}
        usage={assistant.usage}
        pauseLimitUsd={assistant.pauseLimitUsd}
        onSetPinned={assistant.setPinned}
        onResolveItem={assistant.resolveItem}
        onResume={assistant.resume}
      />
    </section>
  )
}
