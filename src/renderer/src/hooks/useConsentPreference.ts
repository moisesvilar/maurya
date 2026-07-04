import { useCallback, useState } from 'react'

/** Clave de persistencia del aviso de grabación desactivado (nota técnica SPEC-019). */
const STORAGE_KEY = 'maurya:recording-consent-dismissed'

/**
 * Estado inicial de la preferencia: solo un 'true' persistido desactiva el
 * aviso. Lectura defensiva: si localStorage no está disponible, el aviso se
 * muestra (comportamiento conservador para una responsabilidad legal).
 */
function readInitialDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    // localStorage inaccesible: el aviso se sigue mostrando
    return false
  }
}

export interface UseConsentPreferenceResult {
  /** true si el usuario desactivó el aviso ("No volver a mostrar este aviso"). */
  dismissed: boolean
  /**
   * Persiste la desactivación del aviso. SOLO se invoca al confirmar el
   * diálogo con la casilla marcada: cancelar nunca escribe la preferencia.
   */
  persistDismiss: () => void
}

/**
 * Preferencia "No volver a mostrar este aviso" del aviso de consentimiento de
 * grabación (SPEC-019): estado con lazy init desde localStorage (patrón
 * useSidebarCollapsed) y escritura defensiva — si falla, la desactivación
 * sigue aplicando en memoria para la sesión actual. La reactivación del aviso
 * queda fuera del MVP (limitación documentada en la spec).
 */
export function useConsentPreference(): UseConsentPreferenceResult {
  const [dismissed, setDismissed] = useState<boolean>(readInitialDismissed)

  const persistDismiss = useCallback((): void => {
    setDismissed(true)
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Persistencia no disponible: la desactivación aplica en memoria
    }
  }, [])

  return { dismissed, persistDismiss }
}
