import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { CustomPrompt, CustomPromptId } from '@/types/domain'

/** Estado del catálogo de prompts personalizables (SPEC-025). */
export type CustomPromptsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; prompts: CustomPrompt[] }

export interface UseCustomPromptsResult {
  state: CustomPromptsState
  /** Reintenta la carga (botón "Reintentar" del error state). */
  reload: () => void
  /**
   * Guarda el override. Devuelve false si la persistencia falló (el Toast
   * destructive ya se emitió y el Sheet debe permanecer abierto con el texto).
   */
  savePrompt: (id: CustomPromptId, body: string) => Promise<boolean>
  /** Elimina el override (vuelve al default); se invoca tras el AlertDialog. */
  resetPrompt: (id: CustomPromptId) => Promise<void>
}

/**
 * Catálogo fijo de prompts de IA personalizables (SPEC-025). Persistencia
 * exclusiva vía `api.db.*CustomPrompt` (patrón useNoteTemplates): las promesas
 * nunca se rechazan, los fallos viajan como `{ ok: false, error }` y se mapean
 * a error state (listar) o Toast destructive (guardar/restablecer).
 */
export function useCustomPrompts(): UseCustomPromptsResult {
  const [state, setState] = useState<CustomPromptsState>({ status: 'loading' })

  // Estado inicial ya es loading: los setState viven en el callback de la
  // promesa (react-hooks/set-state-in-effect; patrón useNoteTemplates).
  const load = useCallback((): void => {
    void window.api.db.listCustomPrompts().then((result) => {
      if (result.ok) {
        setState({ status: 'ready', prompts: result.data })
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

  const replacePrompt = useCallback((prompt: CustomPrompt): void => {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            prompts: prev.prompts.map((candidate) =>
              candidate.id === prompt.id ? prompt : candidate
            )
          }
        : prev
    )
  }, [])

  const savePrompt = useCallback(
    async (id: CustomPromptId, body: string): Promise<boolean> => {
      const result = await window.api.db.saveCustomPrompt(id, body)
      if (!result.ok) {
        toast.error(result.error.message)
        return false
      }
      replacePrompt(result.data)
      toast('Prompt guardado')
      return true
    },
    [replacePrompt]
  )

  const resetPrompt = useCallback(
    async (id: CustomPromptId): Promise<void> => {
      const result = await window.api.db.resetCustomPrompt(id)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      replacePrompt(result.data)
      toast('Prompt restablecido')
    },
    [replacePrompt]
  )

  return { state, reload, savePrompt, resetPrompt }
}
