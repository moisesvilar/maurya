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
import { Textarea } from '@/components/ui/textarea'
import { templateLabel } from '@/components/interviews/templateLabel'
import type { InterviewGroupFormValues } from '@/hooks/useInterviewGroups'
import type { InterviewGroup, InterviewTemplate, NoteTemplate } from '@/types/domain'

/**
 * Sentinel de los Selects opcionales: Radix Select no admite value vacío,
 * así que "Sin template" viaja como 'none' y se mapea a null al enviar
 * (patrón InterviewFormDialog de SPEC-013).
 */
const NONE = 'none'

export interface InterviewGroupFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Título del Dialog ("Nuevo grupo" / "Editar grupo"). */
  title: string
  /** Texto del botón de envío ("Crear" / "Guardar"). */
  submitLabel: string
  /** Templates de entrevista para el Select (vacío → solo "Sin template"). */
  interviewTemplates: InterviewTemplate[]
  /** Templates de notas para el Select (vacío → solo "Sin template"). */
  noteTemplates: NoteTemplate[]
  /** Grupo precargado (edición); null/undefined para creación. */
  group?: InterviewGroup | null
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (values: InterviewGroupFormValues) => Promise<boolean>
}

interface InterviewGroupFormProps {
  submitLabel: string
  interviewTemplates: InterviewTemplate[]
  noteTemplates: NoteTemplate[]
  group: InterviewGroup | null
  onSubmit: (values: InterviewGroupFormValues) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  nameInputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (campos precargados, sin error residual) sin effects.
 */
function InterviewGroupForm({
  submitLabel,
  interviewTemplates,
  noteTemplates,
  group,
  onSubmit,
  onOpenChange,
  nameInputRef
}: InterviewGroupFormProps): React.ReactElement {
  const [name, setName] = useState(group?.name ?? '')
  const [objective, setObjective] = useState(group?.objective ?? '')
  const [interviewTemplateId, setInterviewTemplateId] = useState(group?.interviewTemplateId ?? NONE)
  const [noteTemplateId, setNoteTemplateId] = useState(group?.noteTemplateId ?? NONE)
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
    // Objetivo: texto tal cual salvo vacío/solo espacios → null; Selects:
    // sentinel NONE → null (SPEC-045).
    void onSubmit({
      name: trimmed,
      objective: objective.trim() === '' ? null : objective,
      interviewTemplateId: interviewTemplateId === NONE ? null : interviewTemplateId,
      noteTemplateId: noteTemplateId === NONE ? null : noteTemplateId
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
        <label htmlFor="group-name" className="text-sm font-medium">
          Nombre
        </label>
        <Input
          ref={nameInputRef}
          id="group-name"
          placeholder="Founders early-stage"
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
        <label htmlFor="group-objective" className="text-sm font-medium">
          Objetivo
        </label>
        <Textarea
          id="group-objective"
          rows={3}
          placeholder="¿Qué quieres aprender con este grupo de entrevistas?"
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="group-interview-template" className="text-sm font-medium">
          Template de preguntas
        </label>
        <Select value={interviewTemplateId} onValueChange={setInterviewTemplateId}>
          <SelectTrigger
            id="group-interview-template"
            data-testid="group-interview-template-select"
            className="w-full"
            aria-label="Template de preguntas"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin template</SelectItem>
            {interviewTemplates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {templateLabel(template)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="group-note-template" className="text-sm font-medium">
          Template de notas
        </label>
        <Select value={noteTemplateId} onValueChange={setNoteTemplateId}>
          <SelectTrigger
            id="group-note-template"
            data-testid="group-note-template-select"
            className="w-full"
            aria-label="Template de notas"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin template</SelectItem>
            {noteTemplates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
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
 * Dialog de grupo de entrevistas (SPEC-045): crear y editar. Calco del patrón
 * InterviewFormDialog (SPEC-013): form real (Enter = submit nativo), error
 * inline "Campo requerido" sin pasar por el bridge, foco al Nombre al abrir
 * vía onOpenAutoFocus SIN select. Los dos templates son Selects opcionales
 * con sentinel 'none' ("Sin template"); el de preguntas etiqueta con
 * templateLabel (nombre + fase) y el de notas con el nombre a secas.
 */
export function InterviewGroupFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  interviewTemplates,
  noteTemplates,
  group = null,
  onSubmit
}: InterviewGroupFormDialogProps): React.ReactElement {
  const nameInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="group-form-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          nameInputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <InterviewGroupForm
          key={`${String(open)}-${group?.id ?? 'new'}`}
          submitLabel={submitLabel}
          interviewTemplates={interviewTemplates}
          noteTemplates={noteTemplates}
          group={group}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
          nameInputRef={nameInputRef}
        />
      </DialogContent>
    </Dialog>
  )
}
