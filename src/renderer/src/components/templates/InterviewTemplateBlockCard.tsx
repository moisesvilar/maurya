import React from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DisabledTooltip } from '@/components/templates/DisabledTooltip'
import { InterviewTemplateQuestionRow } from '@/components/templates/InterviewTemplateQuestionRow'
import type { EditorBlock, EditorQuestion } from '@/hooks/useInterviewTemplateEditor'

interface InterviewTemplateBlockCardProps {
  block: EditorBlock
  /** Posición en la lista (0-based): deshabilita subir/bajar en los extremos. */
  index: number
  /** Total de bloques: con uno solo, eliminar queda deshabilitado. */
  count: number
  /** "Campo requerido" bajo el título del bloque, o null. */
  titleError: string | null
  /** uid de pregunta → "Campo requerido" (mapa plano del editor). */
  questionErrors: Record<string, string>
  /** uid pendiente de foco (título del bloque o texto de una pregunta). */
  pendingFocusUid: string | null
  /** Notifica que el foco pendiente ya se aplicó. */
  onFocusConsumed: () => void
  onChange: (patch: Partial<Pick<EditorBlock, 'title' | 'guidance'>>) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  onQuestionChange: (
    questionUid: string,
    patch: Partial<Pick<EditorQuestion, 'text' | 'guidance'>>
  ) => void
  onMoveQuestion: (questionUid: string, delta: -1 | 1) => void
  onRemoveQuestion: (questionUid: string) => void
  onAddQuestion: () => void
}

/**
 * Card de un bloque dentro del editor de plantillas de entrevista (SPEC-012):
 * cabecera "Bloque N" con acciones de reordenación/eliminación, título
 * requerido, guía opcional y la lista de preguntas del bloque. Eliminar no
 * pide confirmación (recuperable no guardando), pero exige que quede al menos
 * un bloque en la plantilla.
 */
export function InterviewTemplateBlockCard({
  block,
  index,
  count,
  titleError,
  questionErrors,
  pendingFocusUid,
  onFocusConsumed,
  onChange,
  onMove,
  onRemove,
  onQuestionChange,
  onMoveQuestion,
  onRemoveQuestion,
  onAddQuestion
}: InterviewTemplateBlockCardProps): React.ReactElement {
  const isFirst = index === 0
  const isLast = index === count - 1
  const isOnly = count === 1

  const upButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Subir bloque"
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
      aria-label="Bajar bloque"
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
      aria-label="Eliminar bloque"
      disabled={isOnly}
      onClick={onRemove}
    >
      <Trash2 />
    </Button>
  )

  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">Bloque {index + 1}</span>
        <div className="flex items-center gap-1">
          {isFirst ? (
            <DisabledTooltip tooltip="Ya es el primer bloque">{upButton}</DisabledTooltip>
          ) : (
            upButton
          )}
          {isLast ? (
            <DisabledTooltip tooltip="Ya es el último bloque">{downButton}</DisabledTooltip>
          ) : (
            downButton
          )}
          {isOnly ? (
            <DisabledTooltip tooltip="La plantilla necesita al menos un bloque">
              {removeButton}
            </DisabledTooltip>
          ) : (
            removeButton
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={`block-title-${block.uid}`}>
          Título
        </label>
        <Input
          id={`block-title-${block.uid}`}
          placeholder="Contexto y sistemas (5-7 min)"
          value={block.title}
          aria-invalid={titleError !== null}
          onChange={(event) => onChange({ title: event.target.value })}
          ref={(element) => {
            if (element !== null && pendingFocusUid === block.uid) {
              element.focus()
              onFocusConsumed()
            }
          }}
        />
        {titleError !== null && <p className="text-sm text-destructive">{titleError}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={`block-guidance-${block.uid}`}>
          Guía del bloque
        </label>
        <Textarea
          id={`block-guidance-${block.uid}`}
          rows={2}
          placeholder="Propósito, tiempo, señales de alarma…"
          value={block.guidance}
          onChange={(event) => onChange({ guidance: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium">Preguntas</h4>
        {block.questions.map((question, questionIndex) => (
          <InterviewTemplateQuestionRow
            key={question.uid}
            question={question}
            index={questionIndex}
            count={block.questions.length}
            textError={questionErrors[question.uid] ?? null}
            autoFocusText={pendingFocusUid === question.uid}
            onFocusConsumed={onFocusConsumed}
            onChange={(patch) => onQuestionChange(question.uid, patch)}
            onMove={(delta) => onMoveQuestion(question.uid, delta)}
            onRemove={() => onRemoveQuestion(question.uid)}
          />
        ))}
        <div>
          <Button type="button" variant="outline" onClick={onAddQuestion}>
            <Plus />
            Añadir pregunta
          </Button>
        </div>
      </div>
    </Card>
  )
}
