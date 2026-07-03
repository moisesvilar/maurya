import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { NoteTemplate } from '@/types/domain'

/** Estado del listado de plantillas de notas (SPEC-008). */
export type NoteTemplatesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; templates: NoteTemplate[] }

export interface UseNoteTemplatesResult {
  state: NoteTemplatesState
  /** Reintenta la carga (botón "Reintentar" del error state). */
  reload: () => void
  /** Elimina y filtra del listado; los fallos del bridge van a Toast destructive. */
  removeTemplate: (id: string) => Promise<void>
}

/**
 * Listado y borrado de plantillas de notas (SPEC-008). Persistencia exclusiva
 * vía `api.db.*NoteTemplate` (SPEC-006): las promesas nunca se rechazan, los
 * fallos viajan como `{ ok: false, error }` y se mapean a error state (listar)
 * o Toast destructive (eliminar).
 */
export function useNoteTemplates(): UseNoteTemplatesResult {
  const [state, setState] = useState<NoteTemplatesState>({ status: 'loading' })

  // No marca loading por sí mismo: el estado inicial ya lo es, y así el efecto
  // de montaje no hace setState síncrono (react-hooks/set-state-in-effect);
  // los setState viven en el callback de la promesa (patrón useSecrets).
  const load = useCallback((): void => {
    void window.api.db.listNoteTemplates().then((result) => {
      if (result.ok) {
        setState({ status: 'ready', templates: result.data })
      } else {
        setState({ status: 'error', message: result.error.message })
      }
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback((): void => {
    setState({ status: 'loading' })
    load()
  }, [load])

  const removeTemplate = useCallback(async (id: string): Promise<void> => {
    const result = await window.api.db.deleteNoteTemplate(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', templates: prev.templates.filter((template) => template.id !== id) }
        : prev
    )
    toast('Plantilla eliminada')
  }, [])

  return { state, reload, removeTemplate }
}
