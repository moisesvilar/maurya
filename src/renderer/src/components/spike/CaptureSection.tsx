import React, { useEffect, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LevelMeter } from '@/components/spike/LevelMeter'
import { cn } from '@/lib/utils'
import type { AudioLevels, CaptureStatus } from '@/types/audio'

const SPINNER_DELAY_MS = 1000

interface CaptureSectionProps {
  status: CaptureStatus
  elapsedSeconds: number
  levels: AudioLevels
  onStart: () => void
  onStop: () => void
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function CaptureSection({
  status,
  elapsedSeconds,
  levels,
  onStart,
  onStop
}: CaptureSectionProps): React.ReactElement {
  const recording = status === 'recording'
  const [showSpinner, setShowSpinner] = useState(false)

  // Loading de acción: spinner inline solo si el arranque supera 1 s
  useEffect(() => {
    if (status === 'starting') {
      const timer = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS)
      return (): void => {
        window.clearTimeout(timer)
      }
    }
    const reset = window.setTimeout(() => setShowSpinner(false), 0)
    return (): void => {
      window.clearTimeout(reset)
    }
  }, [status])

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">Captura</h3>
      <div className="flex items-center gap-6">
        {recording || status === 'stopping' ? (
          <Button variant="destructive" onClick={onStop} disabled={status === 'stopping'}>
            <Square /> Detener
          </Button>
        ) : (
          <Button onClick={onStart} disabled={status === 'starting'}>
            {showSpinner ? <Loader2 className="animate-spin" /> : <Mic />} Iniciar captura
          </Button>
        )}
        <span
          className={cn('font-mono text-4xl tabular-nums', !recording && 'text-muted-foreground')}
        >
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>
      <div className="space-y-3">
        <LevelMeter label="Micrófono" value={levels.microphone} />
        <LevelMeter label="Sistema" value={levels.system} />
      </div>
    </section>
  )
}
