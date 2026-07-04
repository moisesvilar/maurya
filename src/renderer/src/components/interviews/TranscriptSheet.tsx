import React, { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { speakerLabel } from '@/lib/speakerLabel'
import type { TranscriptLine } from '@/types/audio'

type TranscriptState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; lines: TranscriptLine[] }

interface TranscriptSheetProps {
  transcriptPath: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Sheet lateral de consulta de la transcripción (SPEC-017, RF-NOTE-004): las
 * líneas finales de la conversación en solo lectura, cada una con el Badge de
 * su hablante ("Tú" / "Interlocutor N"). Las líneas se leen al abrir vía
 * `recording:get-transcript-lines`; un archivo ausente o ilegible muestra el
 * estado de error "No se pudo leer la transcripción" sin romper la página.
 */
export function TranscriptSheet({
  transcriptPath,
  open,
  onOpenChange
}: TranscriptSheetProps): React.ReactElement {
  const [state, setState] = useState<TranscriptState>({ status: 'loading' })

  // setState solo en el callback de la promesa, nunca síncrono en el efecto
  // (patrón InterviewDetailPage / react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) {
      return
    }
    void window.api.recording.getTranscriptLines(transcriptPath).then((result) => {
      setState(result.ok ? { status: 'ready', lines: result.lines } : { status: 'error' })
    })
  }, [open, transcriptPath])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Transcripción</SheetTitle>
          <SheetDescription>Conversación de la entrevista, en solo lectura.</SheetDescription>
        </SheetHeader>
        {state.status === 'error' ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center">
            <p className="text-sm text-muted-foreground">No se pudo leer la transcripción</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {state.status === 'ready' && (
              <ul className="flex flex-col gap-3">
                {state.lines.map((line, index) => (
                  <li key={index} className="flex flex-col gap-1">
                    <Badge variant="secondary">{speakerLabel(line)}</Badge>
                    <p className="text-sm whitespace-pre-wrap">{line.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
