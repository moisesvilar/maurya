import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { SecretKind, SecretsStatus } from '@/types/secrets'

const KIND_LABELS: Record<SecretKind, string> = {
  deepgram: 'Deepgram',
  anthropic: 'Anthropic'
}

/** Fallback si get-status falla: sin cifrado disponible = guardado deshabilitado. */
const UNAVAILABLE_STATUS: SecretsStatus = {
  available: false,
  deepgram: { configured: false, last4: null },
  anthropic: { configured: false, last4: null }
}

export interface UseSecretsResult {
  /** null mientras carga el estado inicial (Skeletons en las filas). */
  status: SecretsStatus | null
  /** Guarda la clave; devuelve true si tuvo éxito (la fila limpia el input). */
  save: (kind: SecretKind, value: string) => Promise<boolean>
  remove: (kind: SecretKind) => Promise<void>
}

/**
 * Estado y mutaciones de las claves de IA (SPEC-007). El valor de la clave
 * solo se envía hacia main en `save`; el estado local se actualiza con el
 * KeyStatus que devuelve main (configured + last4), nunca con el valor.
 */
export function useSecrets(): UseSecretsResult {
  const [status, setStatus] = useState<SecretsStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.secrets.getStatus().then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok) {
        setStatus(result.data)
      } else {
        toast.error(result.error.message)
        setStatus(UNAVAILABLE_STATUS)
      }
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  const save = useCallback(async (kind: SecretKind, value: string): Promise<boolean> => {
    const result = await window.api.secrets.save(kind, value)
    if (!result.ok) {
      toast.error(result.error.message)
      return false
    }
    setStatus((prev) => (prev === null ? prev : { ...prev, [kind]: result.data }))
    toast(`Clave de ${KIND_LABELS[kind]} guardada`)
    return true
  }, [])

  const remove = useCallback(async (kind: SecretKind): Promise<void> => {
    const result = await window.api.secrets.remove(kind)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setStatus((prev) => (prev === null ? prev : { ...prev, [kind]: result.data }))
    toast('Clave eliminada')
  }, [])

  return { status, save, remove }
}
