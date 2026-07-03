import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Discovery } from '@/types/domain'

/** Estado del listado de discoveries (SPEC-010). */
export type DiscoveriesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; discoveries: Discovery[] }

export interface UseDiscoveriesResult {
  state: DiscoveriesState
  /** Reintenta la carga (botón "Reintentar" del error state). */
  reload: () => void
  /** Crea un discovery; devuelve true si se creó (para cerrar el Dialog). */
  createDiscovery: (name: string) => Promise<boolean>
  /** Renombra un discovery; devuelve true si se guardó (para cerrar el Dialog). */
  renameDiscovery: (id: string, name: string) => Promise<boolean>
  /** Elimina un discovery (cascada en main, SPEC-006). */
  removeDiscovery: (id: string) => Promise<void>
}

/** Orden del listado: por fecha de actualización descendente (ISO comparable). */
function sortByUpdatedAtDesc(discoveries: Discovery[]): Discovery[] {
  return [...discoveries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * Listado y CRUD de discoveries (SPEC-010). Persistencia exclusiva vía
 * `api.db.*Discovery` (SPEC-006): las promesas nunca se rechazan, los fallos
 * viajan como `{ ok: false, error }` y se mapean a error state (listar) o
 * Toast destructive (mutaciones). El orden es por `updatedAt` desc, siempre
 * con el objeto devuelto por el bridge (que trae el `updatedAt` fresco).
 */
export function useDiscoveries(): UseDiscoveriesResult {
  const [state, setState] = useState<DiscoveriesState>({ status: 'loading' })

  // No marca loading por sí mismo: el estado inicial ya lo es, y así el efecto
  // de montaje no hace setState síncrono (react-hooks/set-state-in-effect);
  // los setState viven en el callback de la promesa (patrón useNoteTemplates).
  const load = useCallback((): void => {
    void window.api.db.listDiscoveries().then((result) => {
      if (result.ok) {
        setState({ status: 'ready', discoveries: sortByUpdatedAtDesc(result.data) })
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

  const createDiscovery = useCallback(async (name: string): Promise<boolean> => {
    const result = await window.api.db.createDiscovery({ name })
    if (!result.ok) {
      toast.error(result.error.message)
      return false
    }
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', discoveries: sortByUpdatedAtDesc([...prev.discoveries, result.data]) }
        : prev
    )
    toast('Discovery creado')
    return true
  }, [])

  const renameDiscovery = useCallback(async (id: string, name: string): Promise<boolean> => {
    const result = await window.api.db.updateDiscovery(id, { name })
    if (!result.ok) {
      toast.error(result.error.message)
      return false
    }
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            discoveries: sortByUpdatedAtDesc(
              prev.discoveries.map((discovery) => (discovery.id === id ? result.data : discovery))
            )
          }
        : prev
    )
    toast('Discovery renombrado')
    return true
  }, [])

  const removeDiscovery = useCallback(async (id: string): Promise<void> => {
    const result = await window.api.db.deleteDiscovery(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            discoveries: prev.discoveries.filter((discovery) => discovery.id !== id)
          }
        : prev
    )
    toast('Discovery eliminado')
  }, [])

  return { state, reload, createDiscovery, renameDiscovery, removeDiscovery }
}
