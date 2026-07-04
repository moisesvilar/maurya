import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { InterviewTemplate } from '@/types/domain'

/** Estado del listado de plantillas de entrevista (SPEC-012). */
export type InterviewTemplatesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; templates: InterviewTemplate[] }

export interface UseInterviewTemplatesResult {
  state: InterviewTemplatesState
  /** Reintenta la carga (botón "Reintentar" del error state). */
  reload: () => void
  /** Elimina y filtra del listado; los fallos del bridge van a Toast destructive. */
  removeTemplate: (id: string) => Promise<void>
  /**
   * Crea una copia completa "«nombre» (copia)" (bloques, guías, preguntas y
   * fase tal cual) y la añade al listado. Sin diálogo: acción no destructiva
   * e inmediatamente reversible eliminando la copia (decisión SPEC-012).
   */
  duplicateTemplate: (template: InterviewTemplate) => Promise<void>
}

/**
 * Listado, borrado y duplicado de plantillas de entrevista (SPEC-012).
 * Persistencia exclusiva vía `api.db.*InterviewTemplate` (SPEC-006): las
 * promesas nunca se rechazan, los fallos viajan como `{ ok: false, error }`
 * y se mapean a error state (listar) o Toast destructive (mutaciones).
 */
export function useInterviewTemplates(): UseInterviewTemplatesResult {
  const [state, setState] = useState<InterviewTemplatesState>({ status: 'loading' })

  // No marca loading por sí mismo: el estado inicial ya lo es, y así el efecto
  // de montaje no hace setState síncrono (react-hooks/set-state-in-effect);
  // los setState viven en el callback de la promesa (patrón useSecrets).
  const load = useCallback((): void => {
    void window.api.db.listInterviewTemplates().then((result) => {
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
    const result = await window.api.db.deleteInterviewTemplate(id)
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

  const duplicateTemplate = useCallback(async (template: InterviewTemplate): Promise<void> => {
    const result = await window.api.db.createInterviewTemplate({
      name: `${template.name} (copia)`,
      phase: template.phase,
      blocks: template.blocks
    })
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    const copy = result.data
    setState((prev) =>
      prev.status === 'ready' ? { status: 'ready', templates: [...prev.templates, copy] } : prev
    )
    toast('Plantilla duplicada')
  }, [])

  return { state, reload, removeTemplate, duplicateTemplate }
}
