import React from 'react'
import { FolderOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { StopResult } from '@/types/audio'

interface ResultSectionProps {
  result: StopResult
  onShowInFinder: () => void
}

function formatDuration(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds)
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Milisegundos → segundos con 1 decimal y coma decimal (es-ES), p. ej. "1,2". */
function formatSeconds(ms: number): string {
  return (ms / 1000).toLocaleString('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })
}

export function ResultSection({ result, onShowInFinder }: ResultSectionProps): React.ReactElement {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Resultado</h3>
      <p className="break-all font-mono text-sm">{result.filePath}</p>
      {result.transcriptPath !== null && (
        <p className="break-all font-mono text-sm">{result.transcriptPath}</p>
      )}
      {result.latency !== null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Latencia STT</span>
          <span>
            {`mediana ${formatSeconds(result.latency.p50Ms)} s · p95 ${formatSeconds(result.latency.p95Ms)} s · máx ${formatSeconds(result.latency.maxMs)} s · ${result.latency.count} ${result.latency.count === 1 ? 'resultado' : 'resultados'}`}
          </span>
          {/* Umbral sobre el valor crudo (p95Ms > 5000), no sobre el redondeo mostrado */}
          {result.latency.p95Ms > 5000 ? (
            <Badge variant="destructive">Lenta</Badge>
          ) : (
            <Badge className="bg-green-600 text-white">OK</Badge>
          )}
        </div>
      )}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>Duración: {formatDuration(result.durationSeconds)}</span>
        <span>PCM 16-bit · 16 kHz · 2 pistas</span>
      </div>
      {/* Ambos archivos comparten carpeta: un solo botón para la carpeta */}
      <Button variant="outline" onClick={onShowInFinder}>
        <FolderOpen /> Mostrar en Finder
      </Button>
    </section>
  )
}
