import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { InterviewGroup } from '@/types/domain'

/** Estado de la sección Grupos de entrevistas del detalle de discovery (SPEC-045). */
export type InterviewGroupsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; groups: InterviewGroup[] }

/** Valores del formulario de grupo ya normalizados ('' → null, NONE → null, SPEC-045). */
export interface InterviewGroupFormValues {
  name: string
  objective: string | null
  interviewTemplateId: string | null
  noteTemplateId: string | null
}

export interface UseInterviewGroupsResult {
  state: InterviewGroupsState
  /** Crea un grupo en el discovery; devuelve true si se creó (para cerrar el Dialog). */
  createGroup: (values: InterviewGroupFormValues) => Promise<boolean>
  /** Edita un grupo (patch completo: null limpia); true si se guardó. */
  updateGroup: (id: string, values: InterviewGroupFormValues) => Promise<boolean>
  /** Elimina un grupo (sus entrevistas sobreviven con interviewGroupId null, SPEC-043). */
  removeGroup: (id: string) => Promise<void>
}

/** Orden del listado: por fecha de alta ascendente (ISO comparable). */
function sortByCreatedAtAsc(groups: InterviewGroup[]): InterviewGroup[] {
  return [...groups].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Grupos de entrevistas de un discovery (SPEC-045). Persistencia exclusiva
 * vía `api.db.*InterviewGroup` (SPEC-043): las promesas nunca se rechazan,
 * los fallos viajan como `{ ok: false, error }` y se mapean a error state
 * (listar) o Toast destructive (mutaciones, sin tocar el estado). Orden por
 * `createdAt` asc; la edición no re-ordena (mantiene el orden de alta).
 */
export function useInterviewGroups(discoveryId: string): UseInterviewGroupsResult {
  const [state, setState] = useState<InterviewGroupsState>({ status: 'loading' })

  // El estado inicial ya es loading, así el efecto de montaje no hace setState
  // síncrono (react-hooks/set-state-in-effect); los setState viven en el
  // callback de la promesa (patrón useCompanies).
  useEffect(() => {
    void window.api.db.listInterviewGroups(discoveryId).then((result) => {
      if (result.ok) {
        setState({ status: 'ready', groups: sortByCreatedAtAsc(result.data) })
      } else {
        setState({ status: 'error', message: result.error.message })
      }
    })
  }, [discoveryId])

  const createGroup = useCallback(
    async (values: InterviewGroupFormValues): Promise<boolean> => {
      const result = await window.api.db.createInterviewGroup({ discoveryId, ...values })
      if (!result.ok) {
        toast.error(result.error.message)
        return false
      }
      setState((prev) =>
        prev.status === 'ready' ? { status: 'ready', groups: [...prev.groups, result.data] } : prev
      )
      toast('Grupo creado')
      return true
    },
    [discoveryId]
  )

  const updateGroup = useCallback(
    async (id: string, values: InterviewGroupFormValues): Promise<boolean> => {
      const result = await window.api.db.updateInterviewGroup(id, values)
      if (!result.ok) {
        toast.error(result.error.message)
        return false
      }
      setState((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              groups: prev.groups.map((group) => (group.id === id ? result.data : group))
            }
          : prev
      )
      toast('Cambios guardados')
      return true
    },
    []
  )

  const removeGroup = useCallback(async (id: string): Promise<void> => {
    const result = await window.api.db.deleteInterviewGroup(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', groups: prev.groups.filter((group) => group.id !== id) }
        : prev
    )
    toast('Grupo eliminado')
  }, [])

  return { state, createGroup, updateGroup, removeGroup }
}
