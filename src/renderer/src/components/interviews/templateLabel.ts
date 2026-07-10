import { PHASE_LABELS } from '@/components/templates/phaseLabels'
import type { InterviewTemplate } from '@/types/domain'

/**
 * Etiqueta del template en los Selects: nombre + fase entre paréntesis si la
 * tiene (SPEC-013). Extraída de InterviewFormDialog en SPEC-020 para
 * reutilizarla en los diálogos de capturas sin romper la regla
 * react-refresh/only-export-components de los archivos de componentes.
 */
export function templateLabel(template: InterviewTemplate): string {
  return template.phase !== null
    ? `${template.name} (${PHASE_LABELS[template.phase]})`
    : template.name
}
