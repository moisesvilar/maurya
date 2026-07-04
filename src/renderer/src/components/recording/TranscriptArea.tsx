import React, { useEffect, useRef } from 'react'
import { TranscriptLine } from '@/components/spike/TranscriptLine'
import type { TranscriptLineView, TranscriptPartials } from '@/hooks/useTranscription'
import type { TranscriptionStatus } from '@/types/audio'

interface TranscriptAreaProps {
  status: TranscriptionStatus
  lines: TranscriptLineView[]
  partials: TranscriptPartials
}

/**
 * Área de transcripción en vivo: líneas finales (Badge de fuente + hablante),
 * parciales en itálica, autoscroll y empty state "Esperando audio…".
 * Extraída de TranscriptionSection del spike (SPEC-015) para compartirla con
 * la sección Grabación de la entrevista, sin cambiar el DOM de /capture.
 */
export function TranscriptArea({
  status,
  lines,
  partials
}: TranscriptAreaProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Scroll automático al último resultado (finales o parcial en curso)
  useEffect(() => {
    const area = scrollRef.current
    if (area !== null) {
      area.scrollTop = area.scrollHeight
    }
  }, [lines, partials])

  const hasPartials = partials.mic !== '' || partials.system !== ''
  const showEmptyState = status === 'active' && lines.length === 0 && !hasPartials

  return (
    <div ref={scrollRef} className="h-[200px] space-y-2 overflow-y-auto rounded-md border p-3">
      {showEmptyState && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Esperando audio…
        </div>
      )}
      {lines.map((line) => (
        <TranscriptLine key={`${line.channel}-${line.startMs}-${line.receivedAtMs}`} line={line} />
      ))}
      {partials.mic !== '' && (
        <p className="text-sm italic text-muted-foreground">{partials.mic}</p>
      )}
      {partials.system !== '' && (
        <p className="text-sm italic text-muted-foreground">{partials.system}</p>
      )}
    </div>
  )
}
