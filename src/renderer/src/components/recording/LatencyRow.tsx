import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { LatencyStats } from '@/types/audio'

/** Milisegundos → segundos con 1 decimal y coma decimal (es-ES), p. ej. "1,2". */
function formatSeconds(ms: number): string {
  return (ms / 1000).toLocaleString('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })
}

interface LatencyRowProps {
  latency: LatencyStats
}

/**
 * Fila "Latencia STT" con Badge OK/Lenta (patrón SPEC-003). Extraída de
 * ResultSection del spike (SPEC-015) para compartirla con el resumen de la
 * sección Grabación de la entrevista, sin cambiar el DOM de /capture.
 */
export function LatencyRow({ latency }: LatencyRowProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Latencia STT</span>
      <span>
        {`mediana ${formatSeconds(latency.p50Ms)} s · p95 ${formatSeconds(latency.p95Ms)} s · máx ${formatSeconds(latency.maxMs)} s · ${latency.count} ${latency.count === 1 ? 'resultado' : 'resultados'}`}
      </span>
      {/* Umbral sobre el valor crudo (p95Ms > 5000), no sobre el redondeo mostrado */}
      {latency.p95Ms > 5000 ? (
        <Badge variant="destructive">Lenta</Badge>
      ) : (
        <Badge className="bg-green-600 text-white">OK</Badge>
      )}
    </div>
  )
}
