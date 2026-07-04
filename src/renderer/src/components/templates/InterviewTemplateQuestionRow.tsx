import React from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DisabledTooltip } from '@/components/templates/DisabledTooltip'
import type { EditorQuestion } from '@/hooks/useInterviewTemplateEditor'

interface InterviewTemplateQuestionRowProps {
  question: EditorQuestion
  /** Posición en el bloque (0-based): deshabilita subir/bajar en los extremos. */
  index: number
  /** Total de preguntas del bloque: con una sola, eliminar queda deshabilitado. */
  count: number
  /** "Campo requerido" bajo el texto de la pregunta, o null. */
  textError: string | null
  /** true si el texto debe recibir el foco al montarse (pregunta recién añadida). */
  autoFocusText: boolean
  /** Notifica que el foco pendiente ya se aplicó. */
  onFocusConsumed: () => void
  onChange: (patch: Partial<Pick<EditorQuestion, 'text' | 'guidance'>>) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}

/**
 * Fila de una pregunta dentro de la card de bloque (SPEC-012): texto requerido,
 * guía opcional y acciones de reordenación/eliminación acotadas al bloque.
 * Eliminar no pide confirmación (recuperable no guardando), pero exige que el
 * bloque conserve al menos una pregunta.
 */
export function InterviewTemplateQuestionRow({
  question,
  index,
  count,
  textError,
  autoFocusText,
  onFocusConsumed,
  onChange,
  onMove,
  onRemove
}: InterviewTemplateQuestionRowProps): React.ReactElement {
  const isFirst = index === 0
  const isLast = index === count - 1
  const isOnly = count === 1

  const upButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Subir pregunta"
      disabled={isFirst}
      onClick={() => onMove(-1)}
    >
      <ChevronUp />
    </Button>
  )

  const downButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Bajar pregunta"
      disabled={isLast}
      onClick={() => onMove(1)}
    >
      <ChevronDown />
    </Button>
  )

  const removeButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-destructive hover:text-destructive"
      aria-label="Eliminar pregunta"
      disabled={isOnly}
      onClick={onRemove}
    >
      <Trash2 />
    </Button>
  )

  return (
    <div className="flex items-start justify-between gap-2 rounded-md border px-3 py-3">
      <div className="flex flex-1 flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={`question-text-${question.uid}`}>
          Pregunta
        </label>
        <Input
          id={`question-text-${question.uid}`}
          placeholder="¿Quién lleva hoy el regulatorio y calidad?"
          value={question.text}
          aria-invalid={textError !== null}
          onChange={(event) => onChange({ text: event.target.value })}
          ref={(element) => {
            if (element !== null && autoFocusText) {
              element.focus()
              onFocusConsumed()
            }
          }}
        />
        {textError !== null && <p className="text-sm text-destructive">{textError}</p>}
        <label className="text-sm font-medium" htmlFor={`question-guidance-${question.uid}`}>
          Guía de la pregunta
        </label>
        <Input
          id={`question-guidance-${question.uid}`}
          placeholder="Qué buscar en la respuesta…"
          value={question.guidance}
          onChange={(event) => onChange({ guidance: event.target.value })}
        />
      </div>
      <div className="flex items-center gap-1">
        {isFirst ? (
          <DisabledTooltip tooltip="Ya es la primera pregunta">{upButton}</DisabledTooltip>
        ) : (
          upButton
        )}
        {isLast ? (
          <DisabledTooltip tooltip="Ya es la última pregunta">{downButton}</DisabledTooltip>
        ) : (
          downButton
        )}
        {isOnly ? (
          <DisabledTooltip tooltip="El bloque necesita al menos una pregunta">
            {removeButton}
          </DisabledTooltip>
        ) : (
          removeButton
        )}
      </div>
    </div>
  )
}
