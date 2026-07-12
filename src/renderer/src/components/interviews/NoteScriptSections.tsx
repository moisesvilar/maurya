import React, { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NoteSection } from '@/components/interviews/NoteSection'
import { ScriptSection } from '@/components/interviews/ScriptSection'
import type { Interview, Note } from '@/types/domain'

type NotePresence = 'loading' | 'present' | 'absent'

interface NoteScriptSectionsProps {
  interview: Interview
  onInterviewUpdated: (interview: Interview) => void
}

/**
 * Disposición de las secciones Nota y Guión en el detalle (SPEC-027,
 * ajustada por SPEC-035):
 * - Sin nota y sin transcripción → solo la sección Guión, haya guión o no
 *   (SPEC-035: sin transcripción no hay acción posible sobre la Nota, así
 *   que la sección no se muestra).
 * - Sin nota pero con transcripción → Guión + controles de generación
 *   de la nota, apilados.
 * - Con nota y sin guión → Nota completa primero y Guión debajo, apilados.
 * - Con guión y nota → Tabs "Notas" / "Guión" (Notas activa por defecto); los
 *   TabsContent van con forceMount + hidden para que cambiar de pestaña no
 *   descarte borradores de edición.
 * La existencia de la nota se resuelve aquí (getNoteByInterview) y se mantiene
 * al día vía onNoteChange de NoteSection (al generar la nota, la vista pasa a
 * pestañas con "Notas" activa sin recargar).
 */
export function NoteScriptSections({
  interview,
  onInterviewUpdated
}: NoteScriptSectionsProps): React.ReactElement {
  const [notePresence, setNotePresence] = useState<NotePresence>('loading')

  // setState en el callback de la promesa, nunca síncrono en el efecto
  // (patrón InterviewDetailPage / react-hooks/set-state-in-effect).
  useEffect(() => {
    void window.api.db.getNoteByInterview(interview.id).then((result) => {
      setNotePresence(result.ok && result.data !== null ? 'present' : 'absent')
    })
  }, [interview.id])

  const handleNoteChange = useCallback((note: Note | null): void => {
    setNotePresence(note !== null ? 'present' : 'absent')
  }, [])

  if (notePresence === 'loading') {
    return <Skeleton className="h-24 w-full" />
  }

  const hasNote = notePresence === 'present'
  const hasScript = interview.scriptMarkdown !== null
  const hasTranscript = interview.transcriptPath !== null

  if (hasScript && hasNote) {
    return (
      <Tabs defaultValue="notes" data-testid="note-script-tabs">
        <TabsList>
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="script">Guión</TabsTrigger>
        </TabsList>
        <TabsContent value="notes" forceMount className="data-[state=inactive]:hidden">
          <NoteSection
            interview={interview}
            onInterviewUpdated={onInterviewUpdated}
            onNoteChange={handleNoteChange}
          />
        </TabsContent>
        <TabsContent value="script" forceMount className="data-[state=inactive]:hidden">
          <ScriptSection interview={interview} onInterviewUpdated={onInterviewUpdated} />
        </TabsContent>
      </Tabs>
    )
  }

  // Sin nota, la sección Nota (controles de generación) solo se muestra si hay
  // transcripción (SPEC-035): sin ella no hay nada que hacer con la Nota y
  // queda solo el Guión, haya guión o no.
  const showNoteSection = hasNote || hasTranscript

  const noteSection = showNoteSection ? (
    <NoteSection
      interview={interview}
      onInterviewUpdated={onInterviewUpdated}
      onNoteChange={handleNoteChange}
    />
  ) : null

  const scriptSection = (
    <ScriptSection interview={interview} onInterviewUpdated={onInterviewUpdated} />
  )

  return (
    <div className="flex flex-col gap-6">
      {hasNote && !hasScript ? (
        <>
          {noteSection}
          {scriptSection}
        </>
      ) : (
        <>
          {scriptSection}
          {noteSection}
        </>
      )}
    </div>
  )
}
