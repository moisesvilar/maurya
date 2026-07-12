import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Pencil, Sparkles, Target } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ObjectiveOverrideDialog } from '@/components/interviews/ObjectiveOverrideDialog'
import { cn } from '@/lib/utils'
import type { Interview } from '@/types/domain'

type KeyStatus = 'loading' | 'ok' | 'missing'

/** Estado visual de un objetivo: sin evaluar / cumplido / evaluado (o marcado) y no cumplido. */
type ObjectiveState = 'pending' | 'met' | 'unmet'

interface ObjectivesSectionProps {
  interview: Interview
  onInterviewUpdated: (interview: Interview) => void
}

const EVALUATION_ERROR_TOAST = 'No se pudieron evaluar los objetivos'

/**
 * Sección Objetivos del detalle de entrevista (SPEC-025), entre la cabecera y
 * la sección Grabación: los objetivos son el indicador de progreso principal y
 * van en la zona superior, siempre visibles. Muestra el seguimiento en vivo
 * del asistente durante la grabación (suscripción a assistant:update, misma
 * fuente que SPEC-016) y, tras la evaluación post-grabación, el estado final
 * con el motivo por objetivo. La evaluación automática viaja por eventos
 * `llm:objective-evaluation`; la manual por el invoke del botón (sin Toast de
 * éxito en la automática: el resultado en la sección es el feedback y ya
 * existe "Grabación guardada").
 * Indicador de cumplido con cambio de forma ADEMÁS de color (Target →
 * CheckCircle2 verde): el color nunca es el único indicador (a11y).
 * Marca manual de cumplimiento (SPEC-028): el lápiz por objetivo abre el
 * diálogo de cumplimiento; la precedencia visual es marca manual > evaluación
 * final > seguimiento en vivo. Con marca manual, la explicación de la
 * evaluación previa queda tachada como historial (nunca es el único canal:
 * coexiste con la explicación reescrita debajo y con `data-overridden`).
 */
export function ObjectivesSection({
  interview,
  onInterviewUpdated
}: ObjectivesSectionProps): React.ReactElement {
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('loading')
  /** Índices cubiertos por el seguimiento en vivo (acumulativo, lo mantiene main). */
  const [liveMet, setLiveMet] = useState<number[]>([])
  /** Evaluación automática post-grabación en curso (eventos de main). */
  const [autoEvaluating, setAutoEvaluating] = useState(false)
  /** Evaluación manual en curso (invoke del botón). */
  const [manualEvaluating, setManualEvaluating] = useState(false)
  /** Índice del objetivo con el diálogo de cumplimiento abierto (SPEC-028); null = cerrado. */
  const [overrideIndex, setOverrideIndex] = useState<number | null>(null)

  const interviewId = interview.id

  // setState en el callback de la promesa, nunca síncrono en el efecto
  // (patrón ScriptSection / react-hooks/set-state-in-effect).
  useEffect(() => {
    void window.api.llm.getStatus().then((result) => {
      setKeyStatus(result.ok && result.data.hasAnthropicKey ? 'ok' : 'missing')
    })
  }, [])

  // Seguimiento en vivo (SPEC-016 vía SPEC-025): los eventos del asistente
  // traen el acumulado completo de índices cubiertos; se sustituye, no se suma.
  useEffect(() => {
    return window.api.assistant.onUpdate((event) => {
      setLiveMet(event.objectivesMet)
    })
  }, [])

  // Evaluación automática post-grabación: progreso, resultado y error. La
  // identidad del callback del padre no debe re-suscribir (ref, patrón
  // RecordingSection).
  const onInterviewUpdatedRef = useRef(onInterviewUpdated)
  useEffect(() => {
    onInterviewUpdatedRef.current = onInterviewUpdated
  }, [onInterviewUpdated])

  useEffect(() => {
    return window.api.llm.onObjectiveEvaluation((event) => {
      if (event.interviewId !== interviewId) {
        return
      }
      if (event.status === 'evaluating') {
        setAutoEvaluating(true)
        return
      }
      setAutoEvaluating(false)
      if (event.status === 'done') {
        onInterviewUpdatedRef.current(event.interview)
        return
      }
      toast.error(EVALUATION_ERROR_TOAST)
    })
  }, [interviewId])

  const objectives = interview.objectives
  const results = interview.objectiveResults ?? null
  const overrides = interview.objectiveOverrides ?? null
  const hasTranscript = interview.transcriptPath !== null
  const evaluating = autoEvaluating || manualEvaluating
  const showEvaluateButton =
    objectives.length > 0 && hasTranscript && results === null && !evaluating
  const canEvaluate = keyStatus === 'ok'

  const handleEvaluate = async (): Promise<void> => {
    setManualEvaluating(true)
    try {
      const result = await window.api.llm.evaluateObjectives(interviewId)
      if (result.ok) {
        onInterviewUpdatedRef.current(result.data)
        toast('Objetivos evaluados')
      } else {
        toast.error(EVALUATION_ERROR_TOAST)
      }
    } finally {
      setManualEvaluating(false)
    }
  }

  /**
   * Estado visual del objetivo `index` con la precedencia de SPEC-028:
   * marca manual > evaluación final > seguimiento en vivo.
   */
  const objectiveState = (index: number): ObjectiveState => {
    const override = overrides?.[index] ?? null
    if (override !== null) {
      return override.met ? 'met' : 'unmet'
    }
    if (results !== null) {
      return results[index]?.met === true ? 'met' : 'unmet'
    }
    return liveMet.includes(index) ? 'met' : 'pending'
  }

  /**
   * Marca manual con reescritura (SPEC-028). El envelope nunca rechaza: sin
   * try/catch. Devuelve true en éxito (el diálogo se cierra) y false en fallo
   * (queda abierto conservando selección y comentario).
   */
  const handleOverrideSubmit = async (
    index: number,
    met: boolean,
    comment: string
  ): Promise<boolean> => {
    const result = await window.api.llm.overrideObjective(interviewId, index, met, comment)
    if (result.ok) {
      onInterviewUpdatedRef.current(result.data)
      toast('Objetivo actualizado')
      return true
    }
    toast.error('No se pudo actualizar el objetivo')
    return false
  }

  /** Botón Evaluar; con Tooltip explicativo cuando falta la clave de Anthropic. */
  const evaluateButton = (): React.ReactElement => {
    const button = (
      <Button
        variant="outline"
        disabled={!canEvaluate}
        onClick={() => void handleEvaluate()}
        data-testid="objectives-evaluate-button"
      >
        <Sparkles />
        Evaluar objetivos
      </Button>
    )
    if (canEvaluate) {
      return button
    }
    return (
      <Tooltip>
        {/* span intermedio: los elementos disabled no disparan eventos de hover */}
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent>
          Configura tu clave de Anthropic en Ajustes para evaluar los objetivos
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <section className="flex flex-col gap-4" data-testid="objectives-section">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Objetivos</h3>
        {evaluating && (
          <Button variant="outline" disabled>
            <Loader2 className="animate-spin" />
            Evaluando objetivos…
          </Button>
        )}
        {showEvaluateButton && evaluateButton()}
      </div>

      {objectives.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Target className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Sin objetivos</p>
          <p className="text-sm text-muted-foreground">
            Se generan con el guión o se añaden editándolo
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {objectives.map((objective, index) => {
            const state = objectiveState(index)
            const override = overrides?.[index] ?? null
            return (
              <li
                key={index}
                className="flex items-start gap-2 text-sm"
                data-testid="objective-item"
                data-state={state}
              >
                {state === 'met' ? (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-500"
                    aria-hidden="true"
                  />
                ) : (
                  <Target
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span>{objective}</span>
                  {results !== null && results[index] !== undefined && (
                    <p
                      className={cn(
                        'text-sm text-muted-foreground',
                        override !== null && 'line-through'
                      )}
                      data-testid="objective-reason"
                      data-overridden={override !== null ? 'true' : undefined}
                    >
                      {results[index].reason}
                    </p>
                  )}
                  {override !== null && (
                    <p
                      className="text-sm text-muted-foreground"
                      data-testid="objective-override-text"
                    >
                      {override.text}
                    </p>
                  )}
                </div>
                {/* Siempre habilitado: el camino sin clave es funcional (SPEC-028) */}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Editar cumplimiento del objetivo"
                  data-testid="objective-override-button"
                  onClick={() => setOverrideIndex(index)}
                >
                  <Pencil />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {overrideIndex !== null && (
        <ObjectiveOverrideDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setOverrideIndex(null)
            }
          }}
          objectiveText={objectives[overrideIndex]}
          initialMet={
            overrides?.[overrideIndex] != null
              ? overrides[overrideIndex].met // re-edición: la marca vigente
              : objectiveState(overrideIndex) !== 'met' // sin marca: contrario al mostrado
          }
          initialComment={overrides?.[overrideIndex]?.comment ?? ''}
          onSubmit={(met, comment) => handleOverrideSubmit(overrideIndex, met, comment)}
        />
      )}
    </section>
  )
}
