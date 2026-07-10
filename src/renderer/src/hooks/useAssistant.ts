import { useCallback, useEffect, useState } from 'react'
import type { AssistantState, AssistantSuggestion, AssistantVote } from '@/types/assistant'
import type { AiUsage } from '@/types/domain'
import type { LlmError } from '@/types/llm'

export interface UseAssistantResult {
  state: AssistantState
  /** Última sugerencia válida: 'analyzing' y 'error' la conservan visible. */
  suggestion: AssistantSuggestion | null
  /** Índices 0-based de objetivos cubiertos (acumulativo, lo mantiene main). */
  objectivesMet: number[]
  error: LlmError | null
  /** Voto de la sugerencia vigente; se resetea con cada sugerencia nueva. */
  vote: AssistantVote | null
  /** Uso de IA de la sesión (SPEC-021); null hasta el primer análisis. */
  usage: AiUsage | null
  /** Límite que provocó la pausa (SPEC-021); null si no está pausado. */
  pauseLimitUsd: number | null
  sendFeedback: (vote: AssistantVote) => void
  /** Reanuda el asistente pausado por límite de coste (SPEC-021). */
  resume: () => void
  /** Llamar al iniciar una grabación nueva (patrón useTranscription). */
  reset: () => void
}

/**
 * Estado del asistente proactivo (SPEC-016), suscrito a los eventos push del
 * main process. Reglas clave: 'analyzing' y 'error' NO borran la sugerencia
 * anterior (solo una nueva 'active' la sustituye, reseteando el voto); el
 * feedback es optimista (resaltado inmediato, main registra el contador).
 * SPEC-021: 'paused' tampoco borra la sugerencia; el usage se actualiza con
 * cada evento que lo traiga y pauseLimitUsd se limpia con 'active'/'idle'.
 */
export function useAssistant(): UseAssistantResult {
  const [state, setState] = useState<AssistantState>('idle')
  const [suggestion, setSuggestion] = useState<AssistantSuggestion | null>(null)
  const [objectivesMet, setObjectivesMet] = useState<number[]>([])
  const [error, setError] = useState<LlmError | null>(null)
  const [vote, setVote] = useState<AssistantVote | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [pauseLimitUsd, setPauseLimitUsd] = useState<number | null>(null)

  useEffect(() => {
    return window.api.assistant.onUpdate((event) => {
      setState(event.state)
      setObjectivesMet(event.objectivesMet)
      if (event.usage !== undefined) {
        setUsage(event.usage)
      }
      if (event.state === 'paused') {
        // Pausa por límite de coste (SPEC-021): conserva sugerencia y voto
        setPauseLimitUsd(event.pauseLimitUsd ?? null)
        return
      }
      if (event.state === 'active' || event.state === 'idle') {
        setPauseLimitUsd(null)
      }
      if (event.state === 'active' && event.suggestion !== undefined) {
        setSuggestion(event.suggestion)
        setVote(null)
        setError(null)
        return
      }
      if (event.state === 'error') {
        setError(event.error ?? null)
        return
      }
      if (event.state === 'analyzing') {
        // Reintento en marcha: se retira la línea de error, se conserva la sugerencia
        setError(null)
      }
    })
  }, [])

  const sendFeedback = useCallback((next: AssistantVote): void => {
    // Optimista: el resaltado no espera al IPC (main nunca lo rechaza)
    setVote(next)
    void window.api.assistant.sendFeedback(next)
  }, [])

  const resume = useCallback((): void => {
    // Main emite el evento de vuelta a 'active'/'idle'; sin estado optimista
    void window.api.assistant.resume()
  }, [])

  const reset = useCallback((): void => {
    setState('idle')
    setSuggestion(null)
    setObjectivesMet([])
    setError(null)
    setVote(null)
    setUsage(null)
    setPauseLimitUsd(null)
  }, [])

  return {
    state,
    suggestion,
    objectivesMet,
    error,
    vote,
    usage,
    pauseLimitUsd,
    sendFeedback,
    resume,
    reset
  }
}
