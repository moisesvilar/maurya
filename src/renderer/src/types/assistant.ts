import type { AiUsage } from './domain'
import type { LlmError } from './llm'

/**
 * Tipos del asistente proactivo en tiempo real (SPEC-016): copiloto Mom Test
 * que analiza la conversación durante la grabación y sugiere la siguiente
 * pregunta. Este módulo NO debe depender del DOM: lo importan (type-only)
 * main y preload. La clave de Anthropic jamás cruza este contrato.
 */

/** Acción sugerida: profundizar en la última respuesta o continuar con el guión. */
export type AssistantAction = 'dig_deeper' | 'continue'

/** Señales de alarma The Mom Test: cumplidos, genéricos y futuros hipotéticos. */
export type AssistantAlarm = 'compliment' | 'generic' | 'hypothetical'

/**
 * Estado del asistente que viaja en cada evento `assistant:update`.
 * 'paused' (SPEC-021): pausado por límite de coste — sin llamadas al LLM hasta
 * "Reanudar"; la grabación y la transcripción no se ven afectadas.
 */
export type AssistantState = 'idle' | 'analyzing' | 'active' | 'no-key' | 'error' | 'paused'

/** La sugerencia en su tamaño justo: acción + pregunta + porqué + alarmas. */
export interface AssistantSuggestion {
  action: AssistantAction
  suggestedQuestion: string
  reason: string
  alarms: AssistantAlarm[]
}

/** Pregunta encolada (SPEC-036): la candidata aceptada, identificable en la cola. */
export interface AssistantQueueItem extends AssistantSuggestion {
  /** uuid generado en main al aceptar la candidata; clave de pin/unpin y de React. */
  id: string
}

/**
 * Cola de preguntas del asistente (SPEC-036): estado de sesión en main, el
 * renderer la refleja tal cual (main es la única fuente de verdad).
 */
export interface AssistantQueue {
  /** Pendientes, la más reciente primero; acotadas por el tamaño configurado. */
  pending: AssistantQueueItem[]
  /** Ancladas por el usuario, en orden de anclado; no consumen hueco. */
  pinned: AssistantQueueItem[]
}

/**
 * Evento push main → renderer. `queue` viaja SIEMPRE completa (SPEC-036):
 * el hook la refleja tal cual y la conservación en 'analyzing'/'error'/'paused'
 * es estructural. `objectivesMet` son índices 0-based de los objetivos de la
 * entrevista, acumulativos (nunca decrecen).
 */
export interface AssistantUpdateEvent {
  state: AssistantState
  /** Cola completa de la sesión (SPEC-036): pendientes ordenadas + ancladas. */
  queue: AssistantQueue
  objectivesMet: number[]
  error?: LlmError
  /** Acumulado de uso de la SESIÓN (SPEC-021); viaja tras el primer análisis. */
  usage?: AiUsage
  /** Límite configurado que provocó la pausa (SPEC-021); acompaña a 'paused'. */
  pauseLimitUsd?: number
}

/**
 * Desenlace manual de una pregunta de la cola (SPEC-039): 'discarded' la
 * retira (al finalizar se pregunta el porqué) y 'answered' la retira
 * disparando un análisis en background que actualiza los objetivos.
 */
export type AssistantQuestionOutcome = 'discarded' | 'answered'

/** Pregunta resuelta manualmente en la sesión (SPEC-039): texto + desenlace. */
export interface AssistantQuestionRecord {
  question: string
  outcome: AssistantQuestionOutcome
}

/**
 * Registro de la sesión del asistente que se persiste con la transcripción
 * (campo `assistant` del transcript.json). null si el asistente no llegó a
 * activarse (sin clave o grabación sin entrevista). Los contadores de
 * feedback 👍/👎 de SPEC-016 quedaron derogados por SPEC-036: el registro
 * conserva el nº de sugerencias aceptadas y el uso de IA (SPEC-021).
 */
export interface AssistantSessionSummary {
  suggestionCount: number
  /** Uso de IA de la sesión (SPEC-021); ceros si no hubo análisis. */
  usage: AiUsage
  /**
   * Preguntas descartadas/respondidas manualmente en la sesión (SPEC-039),
   * descartadas primero. Los transcript.json anteriores a la spec no traen el
   * campo: lectores tolerantes.
   */
  questionOutcomes: AssistantQuestionRecord[]
}

/** API expuesta por el preload en `window.api.assistant`. */
export interface AssistantApi {
  onUpdate: (callback: (event: AssistantUpdateEvent) => void) => () => void
  /** Ancla/desancla una pregunta de la cola (SPEC-036); fire-and-forget. */
  setPinned: (itemId: string, pinned: boolean) => Promise<void>
  /** Descarta o marca respondida una pregunta (SPEC-039); fire-and-forget. */
  resolveItem: (itemId: string, outcome: AssistantQuestionOutcome) => Promise<void>
  /** Reanuda el asistente pausado por límite de coste (SPEC-021). */
  resume: () => Promise<void>
}
