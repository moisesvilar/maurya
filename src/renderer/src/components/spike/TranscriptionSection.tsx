import React from 'react'
import { NoKeyAlert } from '@/components/recording/NoKeyAlert'
import { TranscriptArea } from '@/components/recording/TranscriptArea'
import { TranscriptionStatusBadge } from '@/components/recording/transcriptionStatusBadge'
import type { TranscriptLineView, TranscriptPartials } from '@/hooks/useTranscription'
import type { TranscriptionStatus } from '@/types/audio'

interface TranscriptionSectionProps {
  status: TranscriptionStatus
  lines: TranscriptLineView[]
  partials: TranscriptPartials
}

/**
 * Sección Transcripción del harness /capture. Desde SPEC-015 es un wrapper de
 * los componentes compartidos de components/recording/ (Badge de estado, Alert
 * de key ausente y área de transcripción) con el MISMO DOM que el original.
 */
export function TranscriptionSection({
  status,
  lines,
  partials
}: TranscriptionSectionProps): React.ReactElement {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Transcripción</h3>
        <TranscriptionStatusBadge status={status} />
      </div>
      {status === 'no-key' && <NoKeyAlert />}
      <TranscriptArea status={status} lines={lines} partials={partials} />
    </section>
  )
}
