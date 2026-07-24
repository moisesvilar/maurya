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
 * vacío, así que "Sin plantilla" viaja como 'none' y se mapea a null al enviar
 * (patrón InterviewFormDialog).
 */
const NONE = 'none'

/**
 * Nombre por defecto de la captura (SPEC-032): "Captura dd-mmmm-yyyy hh:mm"
 * con fecha y hora locales — día/hora/minutos con cero inicial, mes completo
 * en español en minúsculas (es-ES) y hora en formato 24 h. Alimenta el
 * placeholder del Título y el nombre aplicado al crear con título vacío.
 */
function defaultCaptureTitle(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleDateString('es-ES', { month: 'long' })
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `Captura ${dd}-${month}-${date.getFullYear()} ${hh}:${mm}`
}

export interface NewCaptureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Discoveries para el Select (vacío → aviso con link "Crear discovery"). */
  discoveries: Discovery[]
  /** Templates de entrevista para el Select (vacío → solo "Sin plantilla"). */
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
  const [showDiscoveryError, setShowDiscoveryError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const noDiscoveries = discoveries.length === 0

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    // Validación inline on submit: solo el Discovery es requerido (SPEC-032
    // deroga la obligatoriedad del Título; vacío → nombre por defecto).
    const trimmedTitle = title.trim()
    const discoveryMissing = discoveryId === ''
    setShowDiscoveryError(discoveryMissing)
    if (discoveryMissing) {
      return
    }
    setSubmitting(true)
    void onSubmit({
      title: trimmedTitle === '' ? defaultCaptureTitle(new Date()) : trimmedTitle,
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
          placeholder={defaultCaptureTitle(new Date())}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
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
          Plantilla de preguntas
        </label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger
            id="capture-template"
            className="w-full"
            aria-label="Plantilla de preguntas"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin plantilla</SelectItem>
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
 * Dialog "Nueva captura" (SPEC-020, SPEC-032): captura nueva con solo título,
 * discovery y plantilla (la empresa/contacto se asignan después). Calco del
 * patrón InterviewFormDialog: form real (Enter = submit nativo), remonte por
 * key, foco al Título al abrir vía onOpenAutoFocus, error inline "Campo
 * requerido" del Discovery sin pasar por el bridge. El Título es opcional
 * (SPEC-032): vacío/blanco → nombre por defecto con fecha y hora locales.
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
