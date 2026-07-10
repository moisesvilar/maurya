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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { templateLabel } from '@/components/interviews/templateLabel'
import type { InterviewFormValues } from '@/hooks/useInterviews'
import type { Contact, Interview, InterviewTemplate } from '@/types/domain'

/**
 * Sentinel de los Selects opcionales: Radix Select no admite value vacío,
 * así que "Sin contacto"/"Sin template" viajan como 'none' y se mapean a
 * null al enviar (patrón NO_PHASE de SPEC-012).
 */
const NONE = 'none'

export interface InterviewFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Título del Dialog ("Nueva entrevista" / "Editar entrevista"). */
  title: string
  /** Texto del botón de envío ("Crear" / "Guardar"). */
  submitLabel: string
  /** Nombre de la empresa (placeholder "Discovery con {empresa}"). */
  companyName: string
  /** Contactos de la empresa para el Select (vacío → solo "Sin contacto"). */
  contacts: Contact[]
  /** Templates de entrevista para el Select (vacío → solo "Sin template"). */
  templates: InterviewTemplate[]
  /** Entrevista precargada (edición); null/undefined para creación. */
  interview?: Interview | null
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (values: InterviewFormValues) => Promise<boolean>
}

interface InterviewFormProps {
  submitLabel: string
  companyName: string
  contacts: Contact[]
  templates: InterviewTemplate[]
  interview: Interview | null
  onSubmit: (values: InterviewFormValues) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  titleInputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (campos precargados, sin error residual) sin effects.
 */
function InterviewForm({
  submitLabel,
  companyName,
  contacts,
  templates,
  interview,
  onSubmit,
  onOpenChange,
  titleInputRef
}: InterviewFormProps): React.ReactElement {
  const [title, setTitle] = useState(interview?.title ?? '')
  const [contactId, setContactId] = useState(interview?.contactId ?? NONE)
  const [templateId, setTemplateId] = useState(interview?.templateId ?? NONE)
  const [showRequiredError, setShowRequiredError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (trimmedTitle === '') {
      setShowRequiredError(true)
      return
    }
    setSubmitting(true)
    void onSubmit({
      title: trimmedTitle,
      contactId: contactId === NONE ? null : contactId,
      templateId: templateId === NONE ? null : templateId
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
        <label htmlFor="interview-title" className="text-sm font-medium">
          Título
        </label>
        <Input
          ref={titleInputRef}
          id="interview-title"
          placeholder={`Discovery con ${companyName}`}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setShowRequiredError(false)
          }}
          aria-invalid={showRequiredError || undefined}
        />
        {showRequiredError && <p className="text-sm text-destructive">Campo requerido</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="interview-contact" className="text-sm font-medium">
          Contacto
        </label>
        <Select value={contactId} onValueChange={setContactId}>
          <SelectTrigger id="interview-contact" className="w-full" aria-label="Contacto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin contacto</SelectItem>
            {contacts.map((contact) => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="interview-template" className="text-sm font-medium">
          Template
        </label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger id="interview-template" className="w-full" aria-label="Template">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin template</SelectItem>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {templateLabel(template)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
 * Dialog de entrevista (SPEC-013): crear y editar. Calco del patrón
 * ContactFormDialog (SPEC-011): form real (Enter = submit nativo), solo
 * Título requerido (error inline "Campo requerido" sin pasar por el bridge),
 * foco al Título al abrir vía onOpenAutoFocus SIN select. Contacto y Template
 * son Selects opcionales con sentinel 'none' ("Sin contacto"/"Sin template").
 */
export function InterviewFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  companyName,
  contacts,
  templates,
  interview = null,
  onSubmit
}: InterviewFormDialogProps): React.ReactElement {
  const titleInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          titleInputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <InterviewForm
          key={`${String(open)}-${interview?.id ?? 'new'}`}
          submitLabel={submitLabel}
          companyName={companyName}
          contacts={contacts}
          templates={templates}
          interview={interview}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
          titleInputRef={titleInputRef}
        />
      </DialogContent>
    </Dialog>
  )
}
