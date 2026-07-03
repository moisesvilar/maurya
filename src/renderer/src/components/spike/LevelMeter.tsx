import React from 'react'
import { Progress } from '@/components/ui/progress'

interface LevelMeterProps {
  label: string
  value: number
}

export function LevelMeter({ label, value }: LevelMeterProps): React.ReactElement {
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
