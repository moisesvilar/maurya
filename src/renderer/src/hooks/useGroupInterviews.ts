import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { CaptureListItem } from '@/types/captures'
import type { Interview, InterviewGroup } from '@/types/domain'

/** Estado del listado de entrevistas de un grupo (SPEC-046). */
export type GroupInterviewsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: CaptureListItem[] }

/**
 * Valores del Dialog "Nueva entrevista" del grupo (SPEC-046). La empresa es
 * requerida (decisión de la spec: el flujo sin empresa ya lo cubren las
 * capturas); `contactIds` lleva los participantes marcados en el orden de
 * marcado. Sin `templateId`: el template se hereda del grupo.
 */
export interface GroupInterviewFormValues {
  title: string
  companyId: string
  contactIds: string[]
}

export interface UseGroupInterviewsResult {
  state: GroupInterviewsState
  /**
   * Crea una entrevista en el grupo (discovery y template heredados del
   * grupo; main fija status draft). Devuelve la entrevista creada (o null en
   * fallo) para que el caller navegue a su detalle (patrón SPEC-044-iter-1);
   * los toasts viven en el hook.
   */
  createInterview: (
    group: InterviewGroup,
    values: GroupInterviewFormValues
  ) => Promise<Interview | null>
  /**
   * Mueve la entrevista al grupo destino (mismo discovery: la invariante la
   * valida main). Devuelve true si fue bien (cierra el Dialog del caller);
   * los toasts viven en el hook y la lista se recarga (la fila desaparece).
   */
  moveInterview: (interviewId: string, targetGroupId: string) => Promise<boolean>
  /**
   * Elimina la entrevista (cascada a sus notas en main; mismo canal que el
   * borrado de Capturas). La fila se quita del estado optimísticamente; los
   * toasts viven en el hook (patrón `removeCapture`).
   */
  removeInterview: (interviewId: string) => Promise<void>
}

/**
 * Entrevistas de un grupo (SPEC-046). Decisión del plan: se resuelven con
 * `listAllInterviews()` filtrado por `interviewGroupId` en el renderer — sin
 * canal IPC nuevo; `CaptureListItem` ya trae companyName/contactNames
 * resueltos en main y el volumen es trivial (patrón useCaptures). Las
 * promesas del bridge nunca se rechazan: los fallos viajan como
 * `{ ok: false, error }` y se mapean a error state (listar) o Toast
 * destructive (crear). Orden por `createdAt` ascendente.
 */
export function useGroupInterviews(groupId: string): UseGroupInterviewsResult {
  const [state, setState] = useState<GroupInterviewsState>({ status: 'loading' })

  // El estado inicial ya es loading, así el efecto de montaje no hace setState
  // síncrono (react-hooks/set-state-in-effect); los setState viven en el
  // callback de la promesa (patrón useCaptures).
  const load = useCallback((): void => {
    void window.api.db.listAllInterviews().then((result) => {
      if (result.ok) {
        const items = result.data
          .filter((item) => item.interview.interviewGroupId === groupId)
          .sort((a, b) => a.interview.createdAt.localeCompare(b.interview.createdAt))
        setState({ status: 'ready', items })
      } else {
        setState({ status: 'error', message: result.error.message })
      }
    })
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])

  const createInterview = useCallback(
    async (group: InterviewGroup, values: GroupInterviewFormValues): Promise<Interview | null> => {
      // Sin `status` (main fija 'draft'). El discovery y el grupo son los del
      // grupo de la página; el template de preguntas se hereda del grupo
      // (o null si el grupo no tiene) — sin selector en el Dialog (RF-DISC-009).
      const result = await window.api.db.createInterview({
        discoveryId: group.discoveryId,
        interviewGroupId: group.id,
        companyId: values.companyId,
        contactIds: values.contactIds,
        templateId: group.interviewTemplateId,
        title: values.title
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return null
      }
      toast('Entrevista creada')
      // Disparo fire-and-forget de la autogeneración del guión (patrón
      // SPEC-033, extendido a este flujo por decisión humana 2026-07-17).
      // Main aplica los guards (sin plantilla / sin clave / guión presente)
      // en silencio; la navegación del caller nunca espera al LLM.
      void window.api.llm.autoGenerateScript(result.data.id)
      // Recarga completa: main re-resuelve los nombres de las referencias.
      load()
      return result.data
    },
    [load]
  )

  const moveInterview = useCallback(
    async (interviewId: string, targetGroupId: string): Promise<boolean> => {
      const result = await window.api.db.updateInterview(interviewId, {
        interviewGroupId: targetGroupId
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return false
      }
      toast('Entrevista movida')
      load()
      return true
    },
    [load]
  )

  const removeInterview = useCallback(async (interviewId: string): Promise<void> => {
    const result = await window.api.db.deleteInterview(interviewId)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            items: prev.items.filter((item) => item.interview.id !== interviewId)
          }
        : prev
    )
    toast('Entrevista eliminada')
  }, [])

  return { state, createInterview, moveInterview, removeInterview }
}
