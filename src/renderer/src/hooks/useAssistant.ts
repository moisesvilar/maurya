import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AssistantQueue,
  AssistantQuestionOutcome,
  AssistantState,
  AssistantUpdateEvent
} from '@/types/assistant'
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
  /** Descarta o marca respondida una pregunta (SPEC-039); main re-emite la cola. */
  resolveItem: (itemId: string, outcome: AssistantQuestionOutcome) => void
  /** Reanuda el asistente pausado por límite de coste (SPEC-021). */
  resume: () => void
  /** Llamar al iniciar una grabación nueva (patrón useTranscription). */
  reset: () => void
}

export interface UseAssistantOptions {
  /**
   * Hidratar con el snapshot de main al montar (SPEC-062): SOLO la ventana
   * desacoplada del asistente, que abre a mitad de sesión y no puede esperar
   * al siguiente análisis. La página principal monta el hook al empezar a
   * grabar, cuando aún no hay nada que hidratar.
   */
  hydrate?: boolean
}

/**
 * Estado del asistente proactivo (SPEC-016), suscrito a los eventos push del
 * main process. SPEC-036: todo evento transporta la cola completa y el hook la
 * refleja tal cual — la conservación en 'analyzing'/'error'/'paused' es
 * estructural, no lógica del hook. Anclar/desanclar viaja a main sin estado
 * optimista (main re-emite la cola mutada de inmediato).
 * SPEC-021: el usage se actualiza con cada evento que lo traiga y
 * pauseLimitUsd se limpia con 'active'/'idle'.
 * SPEC-062: hook ÚNICO para las dos superficies (página y ventana desacoplada)
 * — duplicar la máquina de estados del evento en un hook aparte garantizaría
 * su divergencia, que es justo lo que los ACs prohíben. La única diferencia es
 * el `hydrate` opcional, así que todas las llamadas existentes quedan igual.
 */
export function useAssistant(options?: UseAssistantOptions): UseAssistantResult {
  const [state, setState] = useState<AssistantState>('idle')
  const [queue, setQueue] = useState<AssistantQueue>(EMPTY_QUEUE)
  const [objectivesMet, setObjectivesMet] = useState<number[]>([])
  const [error, setError] = useState<LlmError | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [pauseLimitUsd, setPauseLimitUsd] = useState<number | null>(null)

  /**
   * Marca de que ya llegó un evento push (SPEC-062): un snapshot que resuelva
   * tarde JAMÁS debe pisar un estado más nuevo. Ref y no estado: solo gobierna
   * la aplicación de la hidratación, no el render.
   */
  const pushReceived = useRef(false)
  const hydrate = options?.hydrate ?? false

  useEffect(() => {
    const applyEvent = (event: AssistantUpdateEvent): void => {
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
    }

    // La suscripción va SIEMPRE primero: así ningún evento emitido mientras
    // viaja la consulta del snapshot se pierde.
    const unsubscribe = window.api.assistant.onUpdate((event) => {
      pushReceived.current = true
      applyEvent(event)
    })

    if (hydrate) {
      void window.api.assistant.getSnapshot().then((snapshot) => {
        if (snapshot !== null && !pushReceived.current) {
          applyEvent(snapshot)
        }
      })
    }

    return unsubscribe
  }, [hydrate])

  const setPinned = useCallback((itemId: string, pinned: boolean): void => {
    // Sin estado optimista: main re-emite la cola completa (SPEC-036)
    void window.api.assistant.setPinned(itemId, pinned)
  }, [])

  const resolveItem = useCallback((itemId: string, outcome: AssistantQuestionOutcome): void => {
    // Sin estado optimista (SPEC-039): main re-emite la cola sin la pregunta
    void window.api.assistant.resolveItem(itemId, outcome)
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
    resolveItem,
    resume,
    reset
  }
}
