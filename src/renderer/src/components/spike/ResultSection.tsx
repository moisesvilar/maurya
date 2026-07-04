import React from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LatencyRow } from '@/components/recording/LatencyRow'
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

/**
 * Sección Resultado del harness /capture. Desde SPEC-015 la fila de latencia
 * es el LatencyRow compartido de components/recording/, con el MISMO DOM que
 * el original.
 */
export function ResultSection({ result, onShowInFinder }: ResultSectionProps): React.ReactElement {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Resultado</h3>
      <p className="break-all font-mono text-sm">{result.filePath}</p>
      {result.transcriptPath !== null && (
        <p className="break-all font-mono text-sm">{result.transcriptPath}</p>
      )}
      {result.latency !== null && <LatencyRow latency={result.latency} />}
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
