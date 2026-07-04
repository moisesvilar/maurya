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

/** Estado del asistente que viaja en cada evento `assistant:update`. */
export type AssistantState = 'idle' | 'analyzing' | 'active' | 'no-key' | 'error'

/** La sugerencia en su tamaño justo: acción + pregunta + porqué + alarmas. */
export interface AssistantSuggestion {
  action: AssistantAction
  suggestedQuestion: string
  reason: string
  alarms: AssistantAlarm[]
}

/**
 * Evento push main → renderer. `suggestion` acompaña a 'active' (nueva
 * sugerencia) y a 'error' (se conserva la última válida); 'analyzing' viaja
 * sin sugerencia y el hook conserva la anterior. `objectivesMet` son índices
 * 0-based de los objetivos de la entrevista, acumulativos (nunca decrecen).
 */
export interface AssistantUpdateEvent {
  state: AssistantState
  suggestion?: AssistantSuggestion
  objectivesMet: number[]
  error?: LlmError
}

/** Valoración 👍/👎 de la sugerencia vigente (mutable hasta la siguiente). */
export type AssistantVote = 'up' | 'down'

/**
 * Registro de la sesión del asistente que se persiste con la transcripción
 * (campo `assistant` del transcript.json). null si el asistente no llegó a
 * activarse (sin clave o grabación sin entrevista).
 */
export interface AssistantSessionSummary {
  suggestionCount: number
  feedback: { up: number; down: number }
}

/** API expuesta por el preload en `window.api.assistant`. */
export interface AssistantApi {
  onUpdate: (callback: (event: AssistantUpdateEvent) => void) => () => void
  sendFeedback: (vote: AssistantVote) => Promise<void>
}
