import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchResults } from '@/types/search'

/**
 * Estado de la búsqueda global (SPEC-018): `idle` sin query (mensaje inicial),
 * `ready` con resultados agrupados, `error` si el bridge devolvió fallo (el
 * mensaje de UI es fijo: "No se pudo buscar").
 */
export type GlobalSearchState =
  { status: 'idle' } | { status: 'ready'; results: SearchResults } | { status: 'error' }

/** Debounce corto: datos locales, latencia despreciable (nota técnica SPEC-018). */
const DEBOUNCE_MS = 150

export interface UseGlobalSearchResult {
  query: string
  /** Actualiza la query; en blanco vuelve a idle sin llamar al bridge. */
  setQuery: (query: string) => void
  state: GlobalSearchState
}

/**
 * Búsqueda global con debounce (SPEC-018). La coincidencia corre en main
 * (`api.db.search`); aquí solo se debouncea la query y se protege contra
 * respuestas obsoletas con un contador de peticiones (guarda anti-stale):
 * solo la última petición emitida puede publicar estado.
 */
export function useGlobalSearch(): UseGlobalSearchResult {
  const [query, setQueryState] = useState('')
  const [state, setState] = useState<GlobalSearchState>({ status: 'idle' })
  const requestIdRef = useRef(0)

  const setQuery = useCallback((next: string): void => {
    setQueryState(next)
    if (next.trim() === '') {
      // Invalida cualquier petición en vuelo y vuelve al estado inicial.
      requestIdRef.current += 1
      setState({ status: 'idle' })
    }
  }, [])

  useEffect(() => {
    if (query.trim() === '') {
      return undefined
    }
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(() => {
      void window.api.db.search(query).then((result) => {
        if (requestId !== requestIdRef.current) {
          return
        }
        if (result.ok) {
          setState({ status: 'ready', results: result.data })
        } else {
          setState({ status: 'error' })
        }
      })
    }, DEBOUNCE_MS)
    return (): void => {
      window.clearTimeout(timer)
    }
  }, [query])

  return { query, setQuery, state }
}
