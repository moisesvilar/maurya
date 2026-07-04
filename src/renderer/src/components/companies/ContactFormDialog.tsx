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
import { normalizeOptional } from '@/lib/normalizeOptional'
import type { ContactFormValues } from '@/hooks/useContacts'
import type { Contact } from '@/types/domain'

export interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Título del Dialog ("Nuevo contacto" / "Editar contacto"). */
  title: string
  /** Texto del botón de envío ("Crear" / "Guardar"). */
  submitLabel: string
  /** Contacto precargado (edición); null/undefined para creación. */
  contact?: Contact | null
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (values: ContactFormValues) => Promise<boolean>
}

interface ContactFormProps {
  submitLabel: string
  contact: Contact | null
  onSubmit: (values: ContactFormValues) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  nameInputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (campos precargados null → '', sin error residual) sin effects.
 */
function ContactForm({
  submitLabel,
  contact,
  onSubmit,
  onOpenChange,
  nameInputRef
}: ContactFormProps): React.ReactElement {
  const [name, setName] = useState(contact?.name ?? '')
  const [position, setPosition] = useState(contact?.position ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(contact?.linkedinUrl ?? '')
  const [showRequiredError, setShowRequiredError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setShowRequiredError(true)
      return
    }
    setSubmitting(true)
    void onSubmit({
      name: trimmedName,
      position: normalizeOptional(position),
      linkedinUrl: normalizeOptional(linkedinUrl)
    }).then((succeeded) => {
      setSubmitting(false)
      if (succeeded) {
        onOpenChange(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="contact-name" className="text-sm font-medium">
          Nombre
        </label>
        <Input
          ref={nameInputRef}
          id="contact-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setShowRequiredError(false)
          }}
          aria-invalid={showRequiredError || undefined}
        />
        {showRequiredError && <p className="text-sm text-destructive">Campo requerido</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="contact-position" className="text-sm font-medium">
          Posición
        </label>
        <Input
          id="contact-position"
          placeholder="CEO, Head of Product…"
          value={position}
          onChange={(event) => setPosition(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="contact-linkedin" className="text-sm font-medium">
          LinkedIn
        </label>
        <Input
          id="contact-linkedin"
          placeholder="https://linkedin.com/in/..."
          value={linkedinUrl}
          onChange={(event) => setLinkedinUrl(event.target.value)}
        />
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
 * Dialog de contacto (SPEC-011): crear y editar. Form real (Enter = submit
 * nativo), solo Nombre requerido (error inline "Campo requerido" sin pasar
 * por el bridge), Posición/LinkedIn opcionales normalizados '' → null. Foco
 * al Nombre al abrir vía onOpenAutoFocus SIN select (divergencia deliberada
 * del renombrado de SPEC-010: aquí hay varios campos).
 */
export function ContactFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  contact = null,
  onSubmit
}: ContactFormDialogProps): React.ReactElement {
  const nameInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          nameInputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ContactForm
          key={`${String(open)}-${contact?.id ?? 'new'}`}
          submitLabel={submitLabel}
          contact={contact}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
          nameInputRef={nameInputRef}
        />
      </DialogContent>
    </Dialog>
  )
}
