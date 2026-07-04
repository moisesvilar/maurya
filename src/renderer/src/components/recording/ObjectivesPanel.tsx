import React from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ObjectivesPanelProps {
  objectives: string[]
  /** Índices 0-based de los objetivos cubiertos (acumulativo, lo mantiene main). */
  objectivesMet: number[]
}

/**
 * Panel de objetivos en vivo (SPEC-016): lista compacta bajo el panel del
 * asistente, con estado pendiente/cubierto actualizado en cada análisis.
 * Solo se renderiza si la entrevista tiene objetivos (lo garantiza el padre;
 * aquí se devuelve null por defensa).
 */
export function ObjectivesPanel({
  objectives,
  objectivesMet
}: ObjectivesPanelProps): React.ReactElement | null {
  if (objectives.length === 0) {
    return null
  }
  const met = new Set(objectivesMet)
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-semibold">Objetivos</h4>
      <ul className="flex flex-col gap-1">
        {objectives.map((objective, index) => {
          const covered = met.has(index)
          return (
            <li key={index} className="flex items-center gap-2 text-sm">
              {covered ? (
                <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className={cn(covered && 'text-muted-foreground line-through decoration-1')}>
                {objective}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
