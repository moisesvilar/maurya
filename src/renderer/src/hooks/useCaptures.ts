import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { CaptureListItem } from '@/types/captures'
import type { Interview } from '@/types/domain'

/** Estado del listado global de capturas (SPEC-020). */
export type CapturesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: CaptureListItem[] }

/** Valores del Dialog "Nueva captura" (sentinel de plantilla ya mapeado a null). */
export interface NewCaptureValues {
  title: string
  discoveryId: string
  templateId: string | null
}

/**
 * Valores del Dialog "Editar captura". `contactId` solo viaja si la captura
 * tiene empresa (el Dialog omite el campo en caso contrario): `undefined`
 * significa "no tocar el contacto".
 */
export interface EditCaptureValues {
  title: string
  templateId: string | null
  contactId?: string | null
}

export interface UseCapturesResult {
  state: CapturesState
  /** Reintenta la carga (botón "Reintentar" del error state). */
  reload: () => void
  /** Crea la captura (discovery + companyId null); devuelve la entrevista o null. */
  createCapture: (values: NewCaptureValues) => Promise<Interview | null>
  /** Edita título/plantilla (y contacto si aplica); true si se guardó. */
  updateCapture: (id: string, values: EditCaptureValues) => Promise<boolean>
  /** Elimina la captura (cascada de nota en main) y la filtra del listado. */
  removeCapture: (id: string) => Promise<void>
}

/**
 * Listado global de capturas y sus mutaciones (SPEC-020). Persistencia
 * exclusiva vía `api.db.*` (SPEC-006): las promesas nunca se rechazan, los
 * fallos viajan como `{ ok: false, error }` y se mapean a error state (listar)
 * o Toast destructive (mutaciones). El orden (updatedAt desc) ya viene
 * resuelto de main; tras crear/editar/asignar se recarga el listado completo
 * (decisión del plan: más simple y barato con volumen en decenas).
 */
export function useCaptures(): UseCapturesResult {
  const [state, setState] = useState<CapturesState>({ status: 'loading' })

  // No marca loading por sí mismo: el estado inicial ya lo es, y así el efecto
  // de montaje no hace setState síncrono (react-hooks/set-state-in-effect);
  // los setState viven en el callback de la promesa (patrón useDiscoveries).
  const load = useCallback((): void => {
    void window.api.db.listAllInterviews().then((result) => {
      if (result.ok) {
        setState({ status: 'ready', items: result.data })
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

  const createCapture = useCallback(async (values: NewCaptureValues): Promise<Interview | null> => {
    // Sin `status` (main fija 'draft') y con companyId null: capture-first.
    const result = await window.api.db.createInterview({
      discoveryId: values.discoveryId,
      companyId: null,
      title: values.title,
      templateId: values.templateId
    })
    if (!result.ok) {
      toast.error(result.error.message)
      return null
    }
    toast('Captura creada')
    return result.data
  }, [])

  const updateCapture = useCallback(
    async (id: string, values: EditCaptureValues): Promise<boolean> => {
      const result = await window.api.db.updateInterview(id, {
        title: values.title,
        templateId: values.templateId,
        // SPEC-043: el contacto único del selector viaja como contactIds de 0/1.
        ...(values.contactId !== undefined
          ? { contactIds: values.contactId !== null ? [values.contactId] : [] }
          : {})
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return false
      }
      toast('Cambios guardados')
      // Recarga completa: main re-resuelve los nombres de las referencias.
      load()
      return true
    },
    [load]
  )

  const removeCapture = useCallback(async (id: string): Promise<void> => {
    const result = await window.api.db.deleteInterview(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', items: prev.items.filter((item) => item.interview.id !== id) }
        : prev
    )
    toast('Captura eliminada')
  }, [])

  return { state, reload, createCapture, updateCapture, removeCapture }
}
