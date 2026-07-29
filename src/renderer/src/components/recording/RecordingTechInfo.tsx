import React, { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { LatencyRow } from '@/components/recording/LatencyRow'
import type { RecordingController } from '@/hooks/useRecordingController'
import type { Interview } from '@/types/domain'

interface RecordingTechInfoProps {
  controller: RecordingController
  interview: Interview
}

/**
 * Información técnica de la grabación (SPEC-059): latencia STT y rutas del WAV
 * y del transcript, tras un desplegable al FINAL de la página. Antes ocupaba la
 * zona bajo la cabecera dentro de la RecordingSurface (SPEC-015/030/055), un
 * nivel de importancia que no le corresponde: es material de diagnóstico que se
 * consulta rara vez.
 *
 * - Solo existe en el estado Grabada: sin grabación NO se renderiza (renderizado
 *   condicional, no trigger deshabilitado). `recorded` ya cubre Preparación,
 *   Grabando y «Nueva grabación» en una sola derivación del controller.
 * - Plegado por defecto y sin persistencia: el estado es local a la visita, así
 *   que volver a la página lo muestra plegado de nuevo.
 * - El contenido es el bloque anterior sin cambios (LatencyRow intacta, rutas en
 *   monoespaciada); latencia y transcript siguen siendo condicionales.
 */
export function RecordingTechInfo({
  controller,
  interview
}: RecordingTechInfoProps): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const { recorded, displayLatency } = controller

  if (!recorded) {
    return null
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid="recording-tech-info">
      <CollapsibleTrigger asChild>
        <Button
          data-testid="recording-tech-info-trigger"
          variant="ghost"
          className="w-full justify-start text-sm text-muted-foreground"
        >
          <ChevronRight className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          Mostrar información técnica de la grabación
        </Button>
      </CollapsibleTrigger>

      {/* Sin forceMount: al plegar, Radix conserva el contenedor (hidden, para
          medir la altura) pero desmonta sus hijos — las métricas no existen en
          el DOM mientras el desplegable está cerrado */}
      <CollapsibleContent data-testid="recording-tech-info-content">
        <div className="flex flex-col gap-3 pt-2">
          {displayLatency !== null && <LatencyRow latency={displayLatency} />}
          <p className="break-all font-mono text-sm">{interview.wavPath}</p>
          {interview.transcriptPath !== null && (
            <p className="break-all font-mono text-sm">{interview.transcriptPath}</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
