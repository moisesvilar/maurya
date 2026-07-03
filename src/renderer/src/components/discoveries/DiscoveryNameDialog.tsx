import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface DiscoveryNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Título del Dialog ("Nuevo discovery" / "Renombrar discovery"). */
  title: string
  /** Texto del botón de envío ("Crear" / "Guardar"). */
  submitLabel: string
  /** Nombre precargado (renombrado); '' para creación. */
  initialName?: string
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (name: string) => Promise<boolean>
}

interface DiscoveryNameFormProps {
  submitLabel: string
  initialName: string
  onSubmit: (name: string) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (nombre precargado, sin error residual) sin necesidad de effects.
 */
function DiscoveryNameForm({
  submitLabel,
  initialName,
  onSubmit,
  onOpenChange,
  inputRef
}: DiscoveryNameFormProps): React.ReactElement {
  const [name, setName] = useState(initialName)
  const [showRequiredError, setShowRequiredError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') {
      setShowRequiredError(true)
      return
    }
    setSubmitting(true)
    void onSubmit(trimmed).then((succeeded) => {
      setSubmitting(false)
      if (succeeded) {
        onOpenChange(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="discovery-name" className="text-sm font-medium">
          Nombre
        </label>
        <Input
          ref={inputRef}
          id="discovery-name"
          placeholder="Discovery de Maurya"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setShowRequiredError(false)
          }}
          aria-invalid={showRequiredError || undefined}
        />
        {showRequiredError && <p className="text-sm text-destructive">Campo requerido</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Dialog reutilizable de nombre de discovery (SPEC-010): crear y renombrar.
 * Form real (Enter = submit nativo), validación de vacío/solo espacios con
 * error inline "Campo requerido" sin pasar por el bridge, y foco + selección
 * del nombre al abrir vía onOpenAutoFocus (cubre el autofocus de creación,
 * la precarga seleccionada del renombrado y el robo de foco del DropdownMenu).
 */
export function DiscoveryNameDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialName = '',
  onSubmit
}: DiscoveryNameDialogProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DiscoveryNameForm
          key={`${String(open)}-${initialName}`}
          submitLabel={submitLabel}
          initialName={initialName}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
          inputRef={inputRef}
        />
      </DialogContent>
    </Dialog>
  )
}
