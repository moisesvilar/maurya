import type { InterviewStatus } from '@/types/domain'

/**
 * Etiquetas UI del estado de una entrevista (SPEC-013): los valores
 * persistidos son ingleses (SPEC-006), la interfaz los presenta en
 * castellano. El Record es completo para que TypeScript obligue a cubrir
 * todos los estados del dominio. `draft` → "Borrador" es contractual en
 * SPEC-013, `prepared` → "Preparada" en SPEC-014, `recorded` → "Grabada" en
 * SPEC-015 y `summarized` → "Resumida" en SPEC-017.
 */
export const STATUS_LABELS: Record<InterviewStatus, string> = {
  draft: 'Borrador',
  // Contractual (SPEC-014): estado tras generar el guión con IA.
  prepared: 'Preparada',
  // Contractual (SPEC-015): estado tras asociar una grabación a la entrevista.
  recorded: 'Grabada',
  // Contractual (SPEC-017): estado tras generar la nota de resumen con IA.
  summarized: 'Resumida'
}
