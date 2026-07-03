import React from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { EditorSection } from '@/hooks/useNoteTemplateEditor'
import type { NoteTemplateSection } from '@/types/domain'

interface NoteTemplateSectionCardProps {
  section: EditorSection
  /** Posición en la lista (0-based): deshabilita subir/bajar en los extremos. */
  index: number
  /** Total de secciones: con una sola, eliminar queda deshabilitado. */
  count: number
  /** "Campo requerido" bajo el título, o null. */
  titleError: string | null
  /** true si el título debe recibir el foco al montarse (sección recién añadida). */
  autoFocusTitle: boolean
  /** Notifica que el foco pendiente ya se aplicó. */
  onFocusConsumed: () => void
  onChange: (patch: Partial<NoteTemplateSection>) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}

/**
 * Envuelve un botón deshabilitado para que el Tooltip funcione: un botón
 * disabled no dispara eventos de puntero, así que el trigger real es un span
 * con tabIndex 0 (patrón ApiKeyRow / SPEC-007).
 */
function DisabledTooltip({
  tooltip,
  children
}: {
  tooltip: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Card ligera de una sección dentro del editor de plantillas (SPEC-008):
 * acciones de reordenación/eliminación arriba a la derecha, título requerido
 * y descripción opcional. Eliminar no pide confirmación (recuperable no
 * guardando), pero exige que quede al menos una sección.
 */
export function NoteTemplateSectionCard({
  section,
  index,
  count,
  titleError,
  autoFocusTitle,
  onFocusConsumed,
  onChange,
  onMove,
  onRemove
}: NoteTemplateSectionCardProps): React.ReactElement {
  const isFirst = index === 0
  const isLast = index === count - 1
  const isOnly = count === 1

  const upButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Subir sección"
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
      aria-label="Bajar sección"
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
      aria-label="Eliminar sección"
      disabled={isOnly}
      onClick={onRemove}
    >
      <Trash2 />
    </Button>
  )

  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-center justify-end gap-1">
        {isFirst ? (
          <DisabledTooltip tooltip="Ya es la primera sección">{upButton}</DisabledTooltip>
        ) : (
          upButton
        )}
        {isLast ? (
          <DisabledTooltip tooltip="Ya es la última sección">{downButton}</DisabledTooltip>
        ) : (
          downButton
        )}
        {isOnly ? (
          <DisabledTooltip tooltip="La plantilla necesita al menos una sección">
            {removeButton}
          </DisabledTooltip>
        ) : (
          removeButton
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={`section-title-${section.uid}`}>
          Título
        </label>
        <Input
          id={`section-title-${section.uid}`}
          value={section.title}
          aria-invalid={titleError !== null}
          onChange={(event) => onChange({ title: event.target.value })}
          ref={(element) => {
            if (element !== null && autoFocusTitle) {
              element.focus()
              onFocusConsumed()
            }
          }}
        />
        {titleError !== null && <p className="text-sm text-destructive">{titleError}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor={`section-description-${section.uid}`}>
          Descripción
        </label>
        <Textarea
          id={`section-description-${section.uid}`}
          rows={3}
          placeholder="Qué debe contener esta sección…"
          value={section.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </div>
    </Card>
  )
}
