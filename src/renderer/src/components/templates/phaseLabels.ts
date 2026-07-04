import type { InterviewPhase } from '@/types/domain'

/**
 * Etiquetas UI de la fase metodológica de un template de entrevista
 * (SPEC-012): los valores persistidos son ingleses (SPEC-006), la interfaz
 * los presenta en castellano.
 */
export const PHASE_LABELS: Record<InterviewPhase, string> = {
  exploratory: 'Exploratoria',
  problem: 'Problema',
  solution: 'Solución'
}
