import React, { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface EditInterviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Título actual de la entrevista: precarga el campo en cada apertura. */
  interviewTitle: string
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (title: string) => Promise<boolean>
}

interface EditInterviewFormProps {
  interviewTitle: string
  onSubmit: (title: string) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  titleInputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form precargado con el
 * título de la entrevista y sin error residual, sin effects de reset.
 */
function EditInterviewForm({
  interviewTitle,
  onSubmit,
  onOpenChange,
  titleInputRef
}: EditInterviewFormProps): React.ReactElement {
  const [title, setTitle] = useState(interviewTitle)
  const [showTitleError, setShowTitleError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (trimmedTitle === '') {
      setShowTitleError(true)
      return
    }
    // Sin cambios: se cierra sin tocar el bridge (0 escrituras, 0 toast).
    if (trimmedTitle === interviewTitle) {
      onOpenChange(false)
      return
    }
    setSubmitting(true)
    void onSubmit(trimmedTitle).then((succeeded) => {
      setSubmitting(false)
      if (succeeded) {
        onOpenChange(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="edit-interview-title" className="text-sm font-medium">
          Título
        </label>
        <Input
          ref={titleInputRef}
          id="edit-interview-title"
          data-testid="edit-interview-title-input"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setShowTitleError(false)
          }}
          aria-invalid={showTitleError || undefined}
        />
        {showTitleError && <p className="text-sm text-destructive">Campo requerido</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Dialog "Editar entrevista" de la página del grupo: por ahora un único campo
 * Título (requerido), precargado con el valor actual. Calco del patrón
 * GroupInterviewFormDialog: form real (Enter = submit nativo), error inline
 * "Campo requerido" sin pasar por el bridge, foco al Título al abrir vía
 * onOpenAutoFocus SIN select, remonte por key en cada apertura.
 */
export function EditInterviewDialog({
  open,
  onOpenChange,
  interviewTitle,
  onSubmit
}: EditInterviewDialogProps): React.ReactElement {
  const titleInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="edit-interview-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          titleInputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Editar entrevista</DialogTitle>
        </DialogHeader>
        <EditInterviewForm
          key={`${String(open)}-${interviewTitle}`}
          interviewTitle={interviewTitle}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
          titleInputRef={titleInputRef}
        />
      </DialogContent>
    </Dialog>
  )
}
