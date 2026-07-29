import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MarkdownView } from '@/components/markdown/MarkdownView'
import type { Interview } from '@/types/domain'

type ScriptWindowState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; interview: Interview }

/**
 * Vista de la ventana desacoplada del guión (SPEC-062, ruta
 * /detached/script/:interviewId, FUERA del Layout): el guión renderizado como
 * markdown de SOLO LECTURA a ventana completa con scroll vertical — sin
 * editor, sin guardar y sin regenerar. La edición vive únicamente en la página
 * principal (RF-GUION-005): durante la llamada el guión se consulta, y un doble
 * editor crearía conflictos de guardado sin caso de uso.
 *
 * Sincronía en vivo: se suscribe a `db:interview-updated` (señal dedicada que
 * main emite cuando la entrevista se persiste por los caminos que tocan el
 * guión) filtrando por id, y usa el payload del evento directamente sin
 * re-consultar. MarkdownView ya refresca su contenido cuando cambia la prop,
 * así que el AC de actualización sin reabrir sale de ahí.
 */
export function ScriptWindowPage(): React.ReactElement {
  const { interviewId } = useParams<{ interviewId: string }>()
  const [state, setState] = useState<ScriptWindowState>({ status: 'loading' })

  /** Carga (o recarga, desde «Reintentar») la entrevista por el bridge db. */
  const load = useCallback((): void => {
    void window.api.db.getInterview(interviewId ?? '').then((result) => {
      setState(
        result.ok
          ? { status: 'ready', interview: result.data }
          : { status: 'error', message: result.error.message }
      )
    })
  }, [interviewId])

  // setState en el callback de la promesa, nunca síncrono en el efecto
  // (patrón InterviewDetailPage / react-hooks/set-state-in-effect).
  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return window.api.db.onInterviewUpdated((interview) => {
      if (interview.id !== interviewId) {
        return
      }
      // El evento trae la entrevista ya persistida: sin re-consulta y sin
      // carrera. Un error previo se supera solo si llega una versión nueva.
      setState({ status: 'ready', interview })
    })
  }, [interviewId])

  if (state.status === 'loading') {
    return (
      <div data-testid="script-window-root" className="h-screen overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
        </div>
      </div>
    )
  }

  // El error tiene prioridad sobre el vacío: sin entrevista legible no se sabe
  // siquiera si hay guión.
  if (state.status === 'error') {
    return (
      <div data-testid="script-window-root" className="h-screen overflow-y-auto p-4">
        <div
          data-testid="script-window-error"
          className="flex flex-col items-center gap-3 py-12 text-center"
        >
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" onClick={load}>
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  const { scriptMarkdown } = state.interview

  return (
    <div data-testid="script-window-root" className="h-screen overflow-y-auto p-4">
      {scriptMarkdown === null ? (
        // Empty state sin CTA: generar el guión es una acción de la página
        // principal, no de este espejo de consulta.
        <div
          data-testid="script-window-empty"
          className="flex flex-col items-center gap-3 py-12 text-center"
        >
          <p className="text-sm text-muted-foreground">Esta entrevista no tiene guión.</p>
        </div>
      ) : (
        <MarkdownView markdown={scriptMarkdown} testId="script-window-markdown" />
      )}
    </div>
  )
}
