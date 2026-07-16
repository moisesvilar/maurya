import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Interview } from '@/types/domain'

/** Estado de la sección Entrevistas del detalle de empresa (SPEC-013). */
export type InterviewsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; interviews: Interview[] }

/**
 * Valores del formulario de entrevista (sentinels ya mapeados a null).
 * `contactId` es el valor de UI del selector único transicional (SPEC-043):
 * el hook lo persiste como `contactIds` de 0 o 1 elemento.
 * SPEC-044: `discoveryId` viaja en los values (elegido en el Select del
 * Dialog en creación; en edición es el de la propia entrevista, pero
 * `updateInterview` NO lo envía en el patch).
 */
export interface InterviewFormValues {
  discoveryId: string
  title: string
  contactId: string | null
  templateId: string | null
}

export interface UseInterviewsResult {
  state: InterviewsState
  /**
   * Crea una entrevista (main fija status draft). SPEC-044-iter-1: devuelve
   * la entrevista creada (o null en fallo) para que el caller pueda navegar
   * a su detalle con el id devuelto; los toasts siguen viviendo en el hook.
   */
  createInterview: (values: InterviewFormValues) => Promise<Interview | null>
  /**
   * Edita una entrevista. El patch lleva SOLO título, contactos y template
   * (null limpia la referencia); NUNCA envía `discoveryId` (SPEC-044) ni
   * `status` ni los campos de H3/H4 (scriptMarkdown, objectives, wavPath,
   * transcriptPath).
   */
  updateInterview: (id: string, values: InterviewFormValues) => Promise<boolean>
  /** Elimina una entrevista (la cascada de notas la resuelve SPEC-006). */
  removeInterview: (id: string) => Promise<void>
}

/** Orden del listado: por fecha de alta ascendente (ISO comparable). */
function sortByCreatedAtAsc(interviews: Interview[]): Interview[] {
  return [...interviews].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Entrevistas de una empresa (SPEC-013). Persistencia exclusiva vía
 * `api.db.*Interview` (SPEC-006): las promesas nunca se rechazan, los fallos
 * viajan como `{ ok: false, error }` y se mapean a error state (listar) o
 * Toast destructive (mutaciones, sin tocar el estado). Orden por `createdAt`
 * asc; la edición no re-ordena (mantiene el orden de alta). Calco del patrón
 * useContacts (SPEC-011). SPEC-044: la sección Entrevistas vive en
 * /companies/:companyId, sin discovery en la URL — el `discoveryId` (ancla
 * obligatoria de toda entrevista) viaja en los values del formulario; el
 * listado sigue siendo `listInterviews(companyId)`.
 */
export function useInterviews(companyId: string): UseInterviewsResult {
  const [state, setState] = useState<InterviewsState>({ status: 'loading' })

  // El estado inicial ya es loading, así el efecto de montaje no hace setState
  // síncrono (react-hooks/set-state-in-effect); los setState viven en el
  // callback de la promesa (patrón useContacts).
  useEffect(() => {
    void window.api.db.listInterviews(companyId).then((result) => {
      if (result.ok) {
        setState({ status: 'ready', interviews: sortByCreatedAtAsc(result.data) })
      } else {
        setState({ status: 'error', message: result.error.message })
      }
    })
  }, [companyId])

  const createInterview = useCallback(
    async (values: InterviewFormValues): Promise<Interview | null> => {
      // Sin `status`: el repositorio de main fija 'draft' en la creación.
      // SPEC-043: el contacto único del selector viaja como contactIds de 0/1.
      // SPEC-044: el discovery es el elegido en el Select del Dialog.
      const result = await window.api.db.createInterview({
        discoveryId: values.discoveryId,
        companyId,
        title: values.title,
        contactIds: values.contactId !== null ? [values.contactId] : [],
        templateId: values.templateId
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return null
      }
      setState((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', interviews: [...prev.interviews, result.data] }
          : prev
      )
      toast('Entrevista creada')
      // SPEC-044-iter-1: devolver la entrevista permite al caller navegar
      // al detalle recién creado (AC-21 de la spec base).
      return result.data
    },
    [companyId]
  )

  const updateInterview = useCallback(
    async (id: string, values: InterviewFormValues): Promise<boolean> => {
      const result = await window.api.db.updateInterview(id, {
        title: values.title,
        contactIds: values.contactId !== null ? [values.contactId] : [],
        templateId: values.templateId
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return false
      }
      setState((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              interviews: prev.interviews.map((interview) =>
                interview.id === id ? result.data : interview
              )
            }
          : prev
      )
      toast('Cambios guardados')
      return true
    },
    []
  )

  const removeInterview = useCallback(async (id: string): Promise<void> => {
    const result = await window.api.db.deleteInterview(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            interviews: prev.interviews.filter((interview) => interview.id !== id)
          }
        : prev
    )
    toast('Entrevista eliminada')
  }, [])

  return { state, createInterview, updateInterview, removeInterview }
}
