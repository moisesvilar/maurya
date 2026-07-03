import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { TranscriptLineView } from '@/hooks/useTranscription'

interface TranscriptLineProps {
  line: TranscriptLineView
}

function formatOffset(totalSeconds: number): string {
  const rounded = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Línea final del transcript: Badge de fuente + texto + timestamp mm:ss atenuado. */
export function TranscriptLine({ line }: TranscriptLineProps): React.ReactElement {
  const isMic = line.channel === 'mic'
  return (
    <div className="flex items-start gap-2 text-sm">
      <Badge variant={isMic ? 'outline' : 'secondary'} className="shrink-0">
        {isMic ? 'Micrófono' : 'Sistema'}
      </Badge>
      <span className="flex-1">{line.text}</span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {formatOffset(line.offsetSeconds)}
      </span>
    </div>
  )
}
