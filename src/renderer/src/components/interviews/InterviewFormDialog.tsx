import React, { useRef, useState } from 'react'
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
import { ParticipantsChecklist } from '@/components/interviews/ParticipantsChecklist'
import { templateLabel } from '@/components/interviews/templateLabel'
import type { InterviewFormValues } from '@/hooks/useInterviews'
import type { Contact, Discovery, Interview, InterviewTemplate } from '@/types/domain'

/**
 * Sentinel del Select opcional de template: Radix Select no admite value
 * vacío, así que "Sin plantilla" viaja como 'none' y se mapea a null al
 * enviar (patrón NO_PHASE de SPEC-012).
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
  /**
   * Discoveries para el Select requerido de creación (SPEC-044); vacío →
   * Select deshabilitado con aviso y link "Crear discovery". En edición no
   * se usa (el campo no se renderiza).
   */
  discoveries: Discovery[]
  /** Contactos de la empresa para la lista de Checkbox de participantes (SPEC-046). */
  contacts: Contact[]
  /** Templates de entrevista para el Select (vacío → solo "Sin plantilla"). */
  templates: InterviewTemplate[]
  /** Entrevista precargada (edición); null/undefined para creación. */
  interview?: Interview | null
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (values: InterviewFormValues) => Promise<boolean>
}

interface InterviewFormProps {
  submitLabel: string
  companyName: string
  discoveries: Discovery[]
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
  discoveries,
  contacts,
  templates,
  interview,
  onSubmit,
  onOpenChange,
  titleInputRef
}: InterviewFormProps): React.ReactElement {
  // SPEC-044: el Select "Discovery" solo existe en creación; en edición el
  // discovery no se muestra ni se cambia (viaja el de la propia entrevista).
  const isCreation = interview === null
  const [title, setTitle] = useState(interview?.title ?? '')
  // '' = sin elegir (muestra el placeholder del SelectValue); requerido
  // (patrón NewCaptureDialog de SPEC-020, NO el sentinel NONE).
  const [discoveryId, setDiscoveryId] = useState(interview?.discoveryId ?? '')
  // SPEC-046: multiselección de participantes (lista de Checkbox); en
  // edición precargada con los contactos actuales de la entrevista.
  const [contactIds, setContactIds] = useState<string[]>(interview?.contactIds ?? [])
  const [templateId, setTemplateId] = useState(interview?.templateId ?? NONE)
  const [showRequiredError, setShowRequiredError] = useState(false)
  const [showDiscoveryError, setShowDiscoveryError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const noDiscoveries = discoveries.length === 0

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    // Doble validación inline sin bridge: Título siempre, Discovery solo en
    // creación (SPEC-044); ambos errores se muestran a la vez si faltan.
    const trimmedTitle = title.trim()
    const titleMissing = trimmedTitle === ''
    const discoveryMissing = isCreation && discoveryId === ''
    setShowRequiredError(titleMissing)
    setShowDiscoveryError(discoveryMissing)
    if (titleMissing || discoveryMissing) {
      return
    }
    setSubmitting(true)
    void onSubmit({
      discoveryId,
      title: trimmedTitle,
      contactIds,
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
      {isCreation && (
        <div className="flex flex-col gap-2">
          <label htmlFor="interview-discovery" className="text-sm font-medium">
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
              id="interview-discovery"
              data-testid="interview-discovery-select"
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
      )}
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
        <span className="text-sm font-medium">Participantes</span>
        <ParticipantsChecklist
          contacts={contacts}
          selectedIds={contactIds}
          onChange={setContactIds}
          emptyMessage="Esta empresa no tiene contactos"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="interview-template" className="text-sm font-medium">
          Plantilla de preguntas
        </label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger
            id="interview-template"
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
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Dialog de entrevista (SPEC-013): crear y editar. Calco del patrón
 * ContactFormDialog (SPEC-011): form real (Enter = submit nativo), error
 * inline "Campo requerido" sin pasar por el bridge, foco al Título al abrir
 * vía onOpenAutoFocus SIN select. SPEC-046: el Select de contacto único se
 * sustituye por la lista de Checkbox "Participantes" (ParticipantsChecklist,
 * N contactos de la empresa); Template sigue siendo Select opcional con
 * sentinel 'none' ("Sin plantilla"). SPEC-044: en creación el form abre con
 * el Select requerido "Discovery" (sentinel '', patrón NewCaptureDialog); en
 * edición el campo no se renderiza.
 */
export function InterviewFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  companyName,
  discoveries,
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
          discoveries={discoveries}
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
