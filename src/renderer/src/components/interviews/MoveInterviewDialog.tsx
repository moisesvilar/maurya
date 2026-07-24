import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { InterviewGroup } from '@/types/domain'

export interface MoveInterviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Título de la entrevista a mover (contexto en la descripción del Dialog). */
  interviewTitle: string
  /** Grupos destino candidatos: los del discovery SIN el grupo actual. */
  groups: InterviewGroup[]
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (targetGroupId: string) => Promise<boolean>
}

interface MoveInterviewFormProps {
  groups: InterviewGroup[]
  onSubmit: (targetGroupId: string) => Promise<boolean>
  onOpenChange: (open: boolean) => void
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (sin selección ni error residual) sin effects de reset.
 */
function MoveInterviewForm({
  groups,
  onSubmit,
  onOpenChange
}: MoveInterviewFormProps): React.ReactElement {
  // '' = sin elegir (muestra el placeholder del SelectValue); requerido
  // (patrón GroupInterviewFormDialog, sentinel '').
  const [targetGroupId, setTargetGroupId] = useState('')
  const [showRequiredError, setShowRequiredError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const noGroups = groups.length === 0

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (targetGroupId === '') {
      setShowRequiredError(true)
      return
    }
    setSubmitting(true)
    void onSubmit(targetGroupId).then((succeeded) => {
      setSubmitting(false)
      if (succeeded) {
        onOpenChange(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="move-interview-group" className="text-sm font-medium">
          Grupo destino
        </label>
        <Select
          value={targetGroupId}
          onValueChange={(value) => {
            setTargetGroupId(value)
            setShowRequiredError(false)
          }}
          disabled={noGroups}
        >
          <SelectTrigger
            id="move-interview-group"
            data-testid="move-interview-group-select"
            className="w-full"
            aria-label="Grupo destino"
            aria-invalid={showRequiredError || undefined}
          >
            <SelectValue placeholder={noGroups ? 'No hay otros grupos' : 'Selecciona un grupo'} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {noGroups && (
          <p className="text-sm text-muted-foreground">
            No hay otros grupos en este discovery. Crea uno desde el detalle del discovery.
          </p>
        )}
        {showRequiredError && <p className="text-sm text-destructive">Campo requerido</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || noGroups}>
          {submitting && <Loader2 className="animate-spin" />}
          Mover
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Dialog "Mover a otro grupo" de la página del grupo: un único Select
 * requerido con los grupos destino del MISMO discovery (sin el grupo actual;
 * la invariante grupo ∈ discovery la revalida main). Sin candidatos, el
 * Select degrada a disabled con mensaje y el submit queda inerte. Calco del
 * patrón GroupInterviewFormDialog: form real (Enter = submit nativo), error
 * inline "Campo requerido" sin pasar por el bridge, remonte por key en cada
 * apertura.
 */
export function MoveInterviewDialog({
  open,
  onOpenChange,
  interviewTitle,
  groups,
  onSubmit
}: MoveInterviewDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="move-interview-dialog">
        <DialogHeader>
          <DialogTitle>Mover a otro grupo</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{interviewTitle}</p>
        <MoveInterviewForm
          key={String(open)}
          groups={groups}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  )
}
