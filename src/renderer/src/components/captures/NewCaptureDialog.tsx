import React, { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
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
import type { NewCaptureValues } from '@/hooks/useCaptures'
import type { Discovery, InterviewTemplate } from '@/types/domain'

/**
 * Sentinel del Select opcional de plantilla: Radix Select no admite value
 * vacío, así que "Sin template" viaja como 'none' y se mapea a null al enviar
 * (patrón InterviewFormDialog).
 */
const NONE = 'none'

/** Placeholder del título: "Captura dd/mm/aaaa" con la fecha local. */
function defaultTitlePlaceholder(): string {
  const date = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  return `Captura ${date}`
}

export interface NewCaptureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Discoveries para el Select (vacío → aviso con link "Crear discovery"). */
  discoveries: Discovery[]
  /** Templates de entrevista para el Select (vacío → solo "Sin template"). */
  templates: InterviewTemplate[]
  /** Devuelve true si la creación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (values: NewCaptureValues) => Promise<boolean>
}

interface NewCaptureFormProps {
  discoveries: Discovery[]
  templates: InterviewTemplate[]
  onSubmit: (values: NewCaptureValues) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  titleInputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (sin error residual) sin effects.
 */
function NewCaptureForm({
  discoveries,
  templates,
  onSubmit,
  onOpenChange,
  titleInputRef
}: NewCaptureFormProps): React.ReactElement {
  const [title, setTitle] = useState('')
  // '' = sin elegir (muestra el placeholder del SelectValue); requerido.
  const [discoveryId, setDiscoveryId] = useState('')
  const [templateId, setTemplateId] = useState(NONE)
  const [showTitleError, setShowTitleError] = useState(false)
  const [showDiscoveryError, setShowDiscoveryError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const noDiscoveries = discoveries.length === 0

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    // Validación inline on submit, ambos campos independientes (AC).
    const trimmedTitle = title.trim()
    const titleMissing = trimmedTitle === ''
    const discoveryMissing = discoveryId === ''
    setShowTitleError(titleMissing)
    setShowDiscoveryError(discoveryMissing)
    if (titleMissing || discoveryMissing) {
      return
    }
    setSubmitting(true)
    void onSubmit({
      title: trimmedTitle,
      discoveryId,
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
        <label htmlFor="capture-title" className="text-sm font-medium">
          Título
        </label>
        <Input
          ref={titleInputRef}
          id="capture-title"
          placeholder={defaultTitlePlaceholder()}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setShowTitleError(false)
          }}
          aria-invalid={showTitleError || undefined}
        />
        {showTitleError && <p className="text-sm text-destructive">Campo requerido</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="capture-discovery" className="text-sm font-medium">
          Discovery
        </label>
        <Select
          value={discoveryId}
          onValueChange={(value) => {
            setDiscoveryId(value)
            setShowDiscoveryError(false)
          }}
          disabled={noDiscoveries}
        >
          <SelectTrigger
            id="capture-discovery"
            className="w-full"
            aria-label="Discovery"
            aria-invalid={showDiscoveryError || undefined}
          >
            <SelectValue
              placeholder={noDiscoveries ? 'No hay discoveries' : 'Selecciona un discovery'}
            />
          </SelectTrigger>
          <SelectContent>
            {discoveries.map((discovery) => (
              <SelectItem key={discovery.id} value={discovery.id}>
                {discovery.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {noDiscoveries && (
          <p className="text-sm text-muted-foreground">
            No hay discoveries.{' '}
            <Link to="/discoveries" className="font-medium underline underline-offset-4">
              Crear discovery
            </Link>
          </p>
        )}
        {showDiscoveryError && <p className="text-sm text-destructive">Campo requerido</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="capture-template" className="text-sm font-medium">
          Plantilla
        </label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger id="capture-template" className="w-full" aria-label="Plantilla">
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
          {submitting && <Loader2 className="animate-spin" />}
          Crear
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Dialog "Nueva captura" (SPEC-020): captura nueva con solo título, discovery
 * y plantilla (la empresa/contacto se asignan después). Calco del patrón
 * InterviewFormDialog: form real (Enter = submit nativo), remonte por key,
 * foco al Título al abrir vía onOpenAutoFocus, errores inline "Campo
 * requerido" sin pasar por el bridge.
 */
export function NewCaptureDialog({
  open,
  onOpenChange,
  discoveries,
  templates,
  onSubmit
}: NewCaptureDialogProps): React.ReactElement {
  const titleInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="new-capture-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          titleInputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Nueva captura</DialogTitle>
        </DialogHeader>
        <NewCaptureForm
          key={String(open)}
          discoveries={discoveries}
          templates={templates}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
          titleInputRef={titleInputRef}
        />
      </DialogContent>
    </Dialog>
  )
}
