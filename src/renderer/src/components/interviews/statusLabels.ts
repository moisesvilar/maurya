import type { InterviewStatus } from '@/types/domain'

/**
 * Etiquetas UI del estado de una entrevista (SPEC-013): los valores
 * persistidos son ingleses (SPEC-006), la interfaz los presenta en
 * castellano. El Record es completo para que TypeScript obligue a cubrir
 * todos los estados del dominio, pero SOLO `draft` → "Borrador" es
 * contractual en SPEC-013; el resto son provisionales (no contractuales) y
 * los revisarán las specs que introduzcan cada estado (H3 ítems 2-4 y H4).
 */
export const STATUS_LABELS: Record<InterviewStatus, string> = {
  draft: 'Borrador',
  // Provisional (no contractual): lo revisará la spec que introduzca `prepared`.
  prepared: 'Preparada',
  // Provisional (no contractual): lo revisará la spec que introduzca `recorded`.
  recorded: 'Grabada',
  // Provisional (no contractual): lo revisará la spec que introduzca `summarized`.
  summarized: 'Resumida'
}
