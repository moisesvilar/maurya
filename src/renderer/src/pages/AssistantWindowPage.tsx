import React from 'react'
import { AssistantPanel } from '@/components/recording/AssistantPanel'
import { useAssistant } from '@/hooks/useAssistant'

/**
 * Vista de la ventana desacoplada del asistente (SPEC-062, ruta
 * /detached/assistant/:interviewId, FUERA del Layout): solo el panel del
 * asistente a ventana completa con scroll vertical — sin sidebar, top bar,
 * cabecera de entrevista, Objetivos, Nota, Guión ni grabación.
 *
 * Es un ESPEJO, no un traslado: reutiliza el AssistantPanel con exactamente
 * las mismas props que le pasa AssistantLiveSection, de modo que la cola vacía,
 * la pausa por coste, la línea de error y la de uso salen por reutilización y
 * no pueden divergir de la página principal. Las acciones de la cola operan
 * sobre la sesión singleton de main con independencia de la ventana que las
 * dispare, así que funcionan igual desde aquí.
 *
 * `hydrate`: la ventana abre a mitad de sesión, así que consulta el snapshot
 * de main para pintar la cola actual sin esperar al siguiente análisis. No
 * necesita el `interviewId` de la ruta (solo hay una sesión viva a la vez, y
 * main es su única fuente de verdad); el parámetro está en la ruta porque es
 * quien fija el título nativo de la ventana y quien la identifica.
 */
export function AssistantWindowPage(): React.ReactElement {
  const assistant = useAssistant({ hydrate: true })
  return (
    <div data-testid="assistant-window-root" className="h-screen overflow-y-auto p-4">
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
    </div>
  )
}
