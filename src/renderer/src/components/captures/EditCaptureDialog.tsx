import React, { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import type { EditCaptureValues } from '@/hooks/useCaptures'
import type { Contact, Interview, InterviewTemplate } from '@/types/domain'

/** Sentinel de los Selects opcionales (Radix no admite value vacío en items). */
const NONE = 'none'

export interface EditCaptureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Captura a editar; null cierra sin form (el Dialog gobernado por pending). */
  interview: Interview | null
  /** Templates de entrevista para el Select (vacío → solo "Sin template"). */
  templates: InterviewTemplate[]
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (values: EditCaptureValues) => Promise<boolean>
}

interface EditCaptureFormProps {
  interview: Interview
  templates: InterviewTemplate[]
  onSubmit: (values: EditCaptureValues) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  titleInputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (campos precargados, sin error residual) sin effects de reset.
 * El Select de Contacto solo existe si la captura tiene empresa (SPEC-020);
 * sus opciones se cargan lazy al montar.
 */
function EditCaptureForm({
  interview,
  templates,
  onSubmit,
  onOpenChange,
  titleInputRef
}: EditCaptureFormProps): React.ReactElement {
  const [title, setTitle] = useState(interview.title)
  const [templateId, setTemplateId] = useState(interview.templateId ?? NONE)
  const [contactId, setContactId] = useState(interview.contactId ?? NONE)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showRequiredError, setShowRequiredError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const hasCompany = interview.companyId !== null

  // Contactos de la empresa de la captura, cargados lazy al abrir (solo si
  // tiene empresa; sin empresa el campo Contacto no existe).
  useEffect(() => {
    if (interview.companyId === null) {
      return
    }
    void window.api.db.listContacts(interview.companyId).then((result) => {
      if (result.ok) {
        setContacts(result.data)
      } else {
        toast.error(result.error.message)
      }
    })
  }, [interview.companyId])

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
      templateId: templateId === NONE ? null : templateId,
      // contactId solo viaja si la captura tiene empresa (undefined = no tocar)
      ...(hasCompany ? { contactId: contactId === NONE ? null : contactId } : {})
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
        <label htmlFor="edit-capture-title" className="text-sm font-medium">
          Título
        </label>
        <Input
          ref={titleInputRef}
          id="edit-capture-title"
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
        <label htmlFor="edit-capture-template" className="text-sm font-medium">
          Plantilla
        </label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger id="edit-capture-template" className="w-full" aria-label="Plantilla">
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
      {hasCompany && (
        <div className="flex flex-col gap-2">
          <label htmlFor="edit-capture-contact" className="text-sm font-medium">
            Contacto
          </label>
          <Select value={contactId} onValueChange={setContactId}>
            <SelectTrigger id="edit-capture-contact" className="w-full" aria-label="Contacto">
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
      )}
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
 * Dialog "Editar captura" (SPEC-020): Título y Plantilla siempre; Contacto
 * solo si la captura tiene empresa. No reutiliza InterviewFormDialog (campos
 * y placeholder distintos; Contacto condicional) — aquel queda intacto para
 * CompanyDetailPage.
 */
export function EditCaptureDialog({
  open,
  onOpenChange,
  interview,
  templates,
  onSubmit
}: EditCaptureDialogProps): React.ReactElement {
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
          <DialogTitle>Editar captura</DialogTitle>
        </DialogHeader>
        {interview !== null && (
          <EditCaptureForm
            key={`${String(open)}-${interview.id}`}
            interview={interview}
            templates={templates}
            onSubmit={onSubmit}
            onOpenChange={onOpenChange}
            titleInputRef={titleInputRef}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
