import React, { useEffect, useRef } from 'react'
import { Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { TranscriptLine } from '@/components/spike/TranscriptLine'
import type { TranscriptLineView, TranscriptPartials } from '@/hooks/useTranscription'
import type { TranscriptionStatus } from '@/types/audio'

interface TranscriptionSectionProps {
  status: TranscriptionStatus
  lines: TranscriptLineView[]
  partials: TranscriptPartials
}

interface BadgeSpec {
  label: string
  variant: 'secondary' | 'destructive' | 'default'
  className?: string
}

/** Estado no-solo-color (regla 11.4): el texto del Badge cambia junto al color. */
const STATUS_BADGES: Record<TranscriptionStatus, BadgeSpec> = {
  inactive: { label: 'Inactiva', variant: 'secondary' },
  connecting: { label: 'Inactiva', variant: 'secondary' },
  active: { label: 'Transcribiendo', variant: 'default', className: 'bg-green-600 text-white' },
  disconnected: { label: 'Desconectado', variant: 'destructive' },
  'no-key': { label: 'Sin key', variant: 'default', className: 'bg-amber-500 text-white' }
}

export function TranscriptionSection({
  status,
  lines,
  partials
}: TranscriptionSectionProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Scroll automático al último resultado (finales o parcial en curso)
  useEffect(() => {
    const area = scrollRef.current
    if (area !== null) {
      area.scrollTop = area.scrollHeight
    }
  }, [lines, partials])

  const badge = STATUS_BADGES[status]
  const hasPartials = partials.mic !== '' || partials.system !== ''
  const showEmptyState = status === 'active' && lines.length === 0 && !hasPartials

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Transcripción</h3>
        <Badge variant={badge.variant} className={badge.className}>
          {badge.label}
        </Badge>
      </div>
      {status === 'no-key' && (
        <Alert>
          <Info />
          <AlertTitle>Falta la key de Deepgram</AlertTitle>
          <AlertDescription>
            La captura continúa sin transcripción. Configura la variable{' '}
            <code className="font-mono">DEEPGRAM_API_KEY</code> en el archivo{' '}
            <code className="font-mono">.env.local</code> de la raíz del proyecto y reinicia la
            aplicación.
          </AlertDescription>
        </Alert>
      )}
      <div ref={scrollRef} className="h-[200px] space-y-2 overflow-y-auto rounded-md border p-3">
        {showEmptyState && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Esperando audio…
          </div>
        )}
        {lines.map((line) => (
          <TranscriptLine
            key={`${line.channel}-${line.startMs}-${line.receivedAtMs}`}
            line={line}
          />
        ))}
        {partials.mic !== '' && (
          <p className="text-sm italic text-muted-foreground">{partials.mic}</p>
        )}
        {partials.system !== '' && (
          <p className="text-sm italic text-muted-foreground">{partials.system}</p>
        )}
      </div>
    </section>
  )
}
