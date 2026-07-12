import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'

/**
 * Valores del RadioGroup: opción binaria con las dos opciones visibles
 * (design system §4.4; anti-patrón: Select para 2 opciones).
 */
const MET = 'met'
const UNMET = 'unmet'

export interface ObjectiveOverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Texto del objetivo (DialogDescription). */
  objectiveText: string
  /** Preselección del RadioGroup (calculada por el padre: marca vigente o contrario del estado mostrado). */
  initialMet: boolean
  /** Comentario precargado (override.comment vigente o ''). */
  initialComment: string
  /** true = éxito (el diálogo se cierra); false = fallo (permanece abierto conservando selección y comentario). */
  onSubmit: (met: boolean, comment: string) => Promise<boolean>
}

interface ObjectiveOverrideFormProps {
  initialMet: boolean
  initialComment: string
  onSubmit: (met: boolean, comment: string) => Promise<boolean>
  onOpenChange: (open: boolean) => void
}

/**
 * Formulario interno del Dialog (patrón InterviewFormDialog): vive dentro de
 * DialogContent, que Radix desmonta al cerrar, así que cada apertura remonta
 * el form con el estado fresco (campos precargados, sin error residual) sin
 * effects.
 */
function ObjectiveOverrideForm({
  initialMet,
  initialComment,
  onSubmit,
  onOpenChange
}: ObjectiveOverrideFormProps): React.ReactElement {
  const [metValue, setMetValue] = useState(initialMet ? MET : UNMET)
  const [comment, setComment] = useState(initialComment)
  const [showRequiredError, setShowRequiredError] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmedComment = comment.trim()
    if (trimmedComment === '') {
      setShowRequiredError(true)
      return
    }
    setSaving(true)
    // En fallo el diálogo permanece abierto conservando selección y comentario
    void onSubmit(metValue === MET, trimmedComment).then((succeeded) => {
      setSaving(false)
      if (succeeded) {
        onOpenChange(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <RadioGroup value={metValue} onValueChange={setMetValue}>
        <div className="flex items-center gap-2">
          <RadioGroupItem value={MET} id="objective-override-met" />
          <Label htmlFor="objective-override-met">Cumplido</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value={UNMET} id="objective-override-unmet" />
          <Label htmlFor="objective-override-unmet">No cumplido</Label>
        </div>
      </RadioGroup>
      <div className="flex flex-col gap-2">
        <Label htmlFor="objective-override-comment">Comentario</Label>
        <Textarea
          id="objective-override-comment"
          data-testid="objective-override-comment"
          rows={4}
          placeholder="¿Por qué? Aporta la evidencia u observación que justifica el cambio"
          value={comment}
          onChange={(event) => {
            setComment(event.target.value)
            setShowRequiredError(false)
          }}
          aria-invalid={showRequiredError || undefined}
        />
        {showRequiredError && (
          <p className="text-sm text-destructive">El comentario es obligatorio</p>
        )}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        {/* Nunca disabled por validación incompleta (§5.1); solo durante el guardado */}
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Dialog de cumplimiento de un objetivo (SPEC-028): marcar/desmarcar a mano
 * con comentario obligatorio. Dialog y no Sheet: 2 campos, interacción < 30 s
 * (§4.1). Escape/Cancelar cierran sin persistir (no es destructivo sobre datos
 * persistidos, §6.3 no aplica). El resultado de `onSubmit` gobierna el cierre:
 * en fallo el diálogo queda abierto para no perder el comentario escrito.
 */
export function ObjectiveOverrideDialog({
  open,
  onOpenChange,
  objectiveText,
  initialMet,
  initialComment,
  onSubmit
}: ObjectiveOverrideDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="objective-override-dialog">
        <DialogHeader>
          <DialogTitle>Cumplimiento del objetivo</DialogTitle>
          <DialogDescription>{objectiveText}</DialogDescription>
        </DialogHeader>
        <ObjectiveOverrideForm
          key={String(open)}
          initialMet={initialMet}
          initialComment={initialComment}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  )
}
