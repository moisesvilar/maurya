import { useCallback, useEffect, useState } from 'react'
import type { AssistantQueue, AssistantState } from '@/types/assistant'
import type { AiUsage } from '@/types/domain'
import type { LlmError } from '@/types/llm'

const EMPTY_QUEUE: AssistantQueue = { pending: [], pinned: [] }

export interface UseAssistantResult {
  state: AssistantState
  /** Cola completa de la sesión (SPEC-036): main es la única fuente de verdad. */
  queue: AssistantQueue
  /** Índices 0-based de objetivos cubiertos (acumulativo, lo mantiene main). */
  objectivesMet: number[]
  error: LlmError | null
  /** Uso de IA de la sesión (SPEC-021); null hasta el primer análisis. */
  usage: AiUsage | null
  /** Límite que provocó la pausa (SPEC-021); null si no está pausado. */
  pauseLimitUsd: number | null
  /** Ancla/desancla una pregunta de la cola (SPEC-036); main re-emite la cola. */
  setPinned: (itemId: string, pinned: boolean) => void
  /** Reanuda el asistente pausado por límite de coste (SPEC-021). */
  resume: () => void
  /** Llamar al iniciar una grabación nueva (patrón useTranscription). */
  reset: () => void
}

/**
 * Estado del asistente proactivo (SPEC-016), suscrito a los eventos push del
 * main process. SPEC-036: todo evento transporta la cola completa y el hook la
 * refleja tal cual — la conservación en 'analyzing'/'error'/'paused' es
 * estructural, no lógica del hook. Anclar/desanclar viaja a main sin estado
 * optimista (main re-emite la cola mutada de inmediato).
 * SPEC-021: el usage se actualiza con cada evento que lo traiga y
 * pauseLimitUsd se limpia con 'active'/'idle'.
 */
export function useAssistant(): UseAssistantResult {
  const [state, setState] = useState<AssistantState>('idle')
  const [queue, setQueue] = useState<AssistantQueue>(EMPTY_QUEUE)
  const [objectivesMet, setObjectivesMet] = useState<number[]>([])
  const [error, setError] = useState<LlmError | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [pauseLimitUsd, setPauseLimitUsd] = useState<number | null>(null)

  useEffect(() => {
    return window.api.assistant.onUpdate((event) => {
      setState(event.state)
      setQueue(event.queue)
      setObjectivesMet(event.objectivesMet)
      if (event.usage !== undefined) {
        setUsage(event.usage)
      }
      if (event.state === 'paused') {
        // Pausa por límite de coste (SPEC-021): la cola reaparece al reanudar
        setPauseLimitUsd(event.pauseLimitUsd ?? null)
        return
      }
      if (event.state === 'active' || event.state === 'idle') {
        setPauseLimitUsd(null)
      }
      if (event.state === 'active') {
        setError(null)
        return
      }
      if (event.state === 'error') {
        setError(event.error ?? null)
        return
      }
      if (event.state === 'analyzing') {
        // Reintento en marcha: se retira la línea de error, la cola se conserva
        setError(null)
      }
    })
  }, [])

  const setPinned = useCallback((itemId: string, pinned: boolean): void => {
    // Sin estado optimista: main re-emite la cola completa (SPEC-036)
    void window.api.assistant.setPinned(itemId, pinned)
  }, [])

  const resume = useCallback((): void => {
    // Main emite el evento de vuelta a 'active'/'idle'; sin estado optimista
    void window.api.assistant.resume()
  }, [])

  const reset = useCallback((): void => {
    setState('idle')
    setQueue(EMPTY_QUEUE)
    setObjectivesMet([])
    setError(null)
    setUsage(null)
    setPauseLimitUsd(null)
  }, [])

  return {
    state,
    queue,
    objectivesMet,
    error,
    usage,
    pauseLimitUsd,
    setPinned,
    resume,
    reset
  }
}
