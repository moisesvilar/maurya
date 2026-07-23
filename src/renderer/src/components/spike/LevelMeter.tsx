import React from 'react'
import { Progress } from '@/components/ui/progress'

interface LevelMeterProps {
  label: string
  value: number
  /** Variante horizontal estrecha para la top bar (grabación de captura). */
  compact?: boolean
}

export function LevelMeter({ label, value, compact = false }: LevelMeterProps): React.ReactElement {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Progress value={value} aria-label={`Nivel de ${label}`} className="w-20" />
        <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{value}%</span>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{value}%</span>
      </div>
      <Progress value={value} aria-label={`Nivel de ${label}`} />
    </div>
  )
}
