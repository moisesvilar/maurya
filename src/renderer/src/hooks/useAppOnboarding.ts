import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { deriveAppOnboarding, type AppOnboardingView } from '@/lib/appOnboarding'
import type { AppOnboardingStatus } from '@/types/domain'

/**
 * Estado del banner de primeros pasos (SPEC-060). Solo `ready` renderiza: ni
 * `loading` ni `error` ni `hidden` pintan nada (ni skeleton ni placeholder).
 */
export type AppOnboardingState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'hidden' }
  | { status: 'ready'; view: AppOnboardingView }

export interface UseAppOnboardingResult {
  state: AppOnboardingState
  /** Paso 2: persiste la marca de revisión (no bloquea la navegación si falla). */
  markPromptsReviewed: () => Promise<void>
  /** Oculta el banner de forma permanente; sin Toast (desaparecer ES el feedback). */
  hide: () => Promise<void>
}

/**
 * Resuelve las dos fuentes del onboarding de la app (SPEC-060): el agregado del
 * almacén (`db:onboarding:get-status`) y el estado de las claves
 * (`secrets:get-status`), y deriva la vista de los 8 pasos. Se recalcula al
 * MONTAR la página: volver de Ajustes o de Empresas re-monta `/captures` y
 * refresca los checks; no hay suscripción en vivo ni caché entre páginas (es lo
 * que hace que el retroceso derivado —borrar la última empresa— funcione solo).
 *
 * Si CUALQUIERA de los dos envelopes falla → `error` y el banner no se
 * renderiza, con la home intacta. Por eso NO se reutiliza `useSecrets`: ese hook
 * pinta un Toast destructive y aplica un fallback `configured: false` pensado
 * para Ajustes, que aquí mostraría el paso 1 como actual en vez de callarse.
 */
export function useAppOnboarding(): UseAppOnboardingResult {
  const [state, setState] = useState<AppOnboardingState>({ status: 'loading' })

  // Sin setState síncrono en el efecto (react-hooks/set-state-in-effect): el
  // estado inicial ya es loading y los setState viven en el callback de la
  // promesa, con guarda `cancelled` (patrón useSecrets).
  useEffect(() => {
    let cancelled = false
    void Promise.all([window.api.db.getOnboardingStatus(), window.api.secrets.getStatus()]).then(
      ([statusResult, secretsResult]) => {
        if (cancelled) {
          return
        }
        if (!statusResult.ok || !secretsResult.ok) {
          setState({ status: 'error' })
          return
        }
        const status: AppOnboardingStatus = statusResult.data
        if (status.settings.hiddenAt !== null) {
          setState({ status: 'hidden' })
          return
        }
        setState({
          status: 'ready',
          view: deriveAppOnboarding({
            status,
            anthropicConfigured: secretsResult.data.anthropic.configured,
            deepgramConfigured: secretsResult.data.deepgram.configured
          })
        })
      }
    )
    return (): void => {
      cancelled = true
    }
  }, [])

  const markPromptsReviewed = useCallback(async (): Promise<void> => {
    const result = await window.api.db.markOnboardingPromptsReviewed()
    if (!result.ok) {
      // El banner guía, no audita: el fallo se avisa pero la navegación sigue.
      toast.error(result.error.message)
      return
    }
    // El paso 2 pasa a done sin recargar: se re-derivan contador y paso actual
    // sobre las filas ya actualizadas (mismas reglas que deriveAppOnboarding).
    setState((prev) => {
      if (prev.status !== 'ready') {
        return prev
      }
      const steps = prev.view.steps.map((step) =>
        step.step === 2 ? { ...step, done: true } : step
      )
      return {
        status: 'ready',
        view: {
          steps,
          doneCount: steps.filter((step) => step.done).length,
          currentStep: steps.find((step) => !step.done)?.step ?? null
        }
      }
    })
  }, [])

  const hide = useCallback(async (): Promise<void> => {
    const result = await window.api.db.hideAppOnboarding()
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState({ status: 'hidden' })
  }, [])

  return { state, markPromptsReviewed, hide }
}
