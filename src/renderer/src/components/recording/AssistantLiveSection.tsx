import React from 'react'
import { AssistantPanel } from '@/components/recording/AssistantPanel'
import type { RecordingController } from '@/hooks/useRecordingController'

interface AssistantLiveSectionProps {
  controller: RecordingController
}

/**
 * Panel del asistente en su ubicación de página (SPEC-041): durante la
 * grabación vive arriba — en el detalle de entrevista entre «Objetivos» y
 * Nota/Guión; en el de captura inmediatamente encima de Nota/Guión (regla de
 * densidad §8.3: lo más consultado arriba). Fuera de la grabación no se
 * renderiza, como hasta ahora. Componente compartido para no duplicar el
 * cableado en las dos páginas: el AssistantPanel recibe EXACTAMENTE las mismas
 * props que recibía dentro de RecordingSectionView (controller.assistant.*).
 */
export function AssistantLiveSection({
  controller
}: AssistantLiveSectionProps): React.ReactElement | null {
  if (!controller.capturing) {
    return null
  }
  const { assistant } = controller
  return (
    <section data-testid="assistant-live-section">
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
