import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { ParticipantsChecklist } from '@/components/interviews/ParticipantsChecklist'
import type { GroupInterviewFormValues } from '@/hooks/useGroupInterviews'
import type { Company, Contact } from '@/types/domain'

export interface GroupInterviewFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (values: GroupInterviewFormValues) => Promise<boolean>
}

interface GroupInterviewFormProps {
  onSubmit: (values: GroupInterviewFormValues) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  titleInputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (empresas recargadas, sin error residual) sin effects de reset.
 * Las empresas (TODAS las del sistema, SPEC-043) se cargan al montar; los
 * contactos de la empresa elegida, lazy por effect. El reset de participantes
 * al cambiar de empresa vive en el handler (invariante v3: contactos ⊆
 * empresa), no en un effect.
 */
function GroupInterviewForm({
  onSubmit,
  onOpenChange,
  titleInputRef
}: GroupInterviewFormProps): React.ReactElement {
  const [title, setTitle] = useState('')
  // '' = sin elegir (muestra el placeholder del SelectValue); requerido
  // (patrón NewCaptureDialog de SPEC-020, sentinel '').
  const [companyId, setCompanyId] = useState('')
  const [contactIds, setContactIds] = useState<string[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showTitleError, setShowTitleError] = useState(false)
  const [showCompanyError, setShowCompanyError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void window.api.db.listCompanies().then((result) => {
      if (result.ok) {
        setCompanies(result.data)
      } else {
        toast.error(result.error.message)
      }
    })
  }, [])

  // Contactos de la empresa elegida, cargados lazy; el vaciado de la
  // selección al cambiar de empresa vive en handleCompanyChange.
  useEffect(() => {
    if (companyId === '') {
      return
    }
    void window.api.db.listContacts(companyId).then((result) => {
      if (result.ok) {
        setContacts(result.data)
      } else {
        toast.error(result.error.message)
      }
    })
  }, [companyId])

  const noCompanies = companies.length === 0

  const handleCompanyChange = (value: string): void => {
    setCompanyId(value)
    setShowCompanyError(false)
    // Cambiar de empresa vacía la selección de participantes (invariante v3:
    // los contactos pertenecen a la empresa de la entrevista) y la lista (la
    // de la nueva empresa se carga lazy en el effect).
    setContactIds([])
    setContacts([])
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    // Doble validación inline sin bridge: ambos errores a la vez si faltan.
    const trimmedTitle = title.trim()
    const titleMissing = trimmedTitle === ''
    const companyMissing = companyId === ''
    setShowTitleError(titleMissing)
    setShowCompanyError(companyMissing)
    if (titleMissing || companyMissing) {
      return
    }
    setSubmitting(true)
    void onSubmit({ title: trimmedTitle, companyId, contactIds }).then((succeeded) => {
      setSubmitting(false)
      if (succeeded) {
        onOpenChange(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="group-interview-title" className="text-sm font-medium">
          Título
        </label>
        <Input
          ref={titleInputRef}
          id="group-interview-title"
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
        <label htmlFor="group-interview-company" className="text-sm font-medium">
          Empresa
        </label>
        <Select value={companyId} onValueChange={handleCompanyChange} disabled={noCompanies}>
          <SelectTrigger
            id="group-interview-company"
            data-testid="interview-company-select"
            className="w-full"
            aria-label="Empresa"
            aria-invalid={showCompanyError || undefined}
          >
            <SelectValue placeholder={noCompanies ? 'No hay empresas' : 'Selecciona una empresa'} />
          </SelectTrigger>
          <SelectContent>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {noCompanies && (
          <p className="text-sm text-muted-foreground">
            No hay empresas.{' '}
            <Link to="/companies" className="font-medium underline underline-offset-4">
              Crear empresa
            </Link>
          </p>
        )}
        {showCompanyError && <p className="text-sm text-destructive">Campo requerido</p>}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Participantes</span>
        {companyId === '' ? (
          <p className="text-sm text-muted-foreground">Elige una empresa para ver sus contactos</p>
        ) : (
          <ParticipantsChecklist
            contacts={contacts}
            selectedIds={contactIds}
            onChange={setContactIds}
            emptyMessage="Esta empresa no tiene contactos"
          />
        )}
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
 * Dialog "Nueva entrevista" de la página del grupo (SPEC-046): Título
 * (requerido), Empresa (Select requerido con TODAS las empresas del sistema)
 * y Participantes (lista de Checkbox con los contactos de la empresa
 * elegida). SIN selector de template: el template de preguntas es un atributo
 * del grupo y se hereda (RF-DISC-009). Calco del patrón InterviewFormDialog
 * (SPEC-013): form real (Enter = submit nativo), error inline "Campo
 * requerido" sin pasar por el bridge, foco al Título al abrir vía
 * onOpenAutoFocus SIN select, remonte por key en cada apertura.
 */
export function GroupInterviewFormDialog({
  open,
  onOpenChange,
  onSubmit
}: GroupInterviewFormDialogProps): React.ReactElement {
  const titleInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="group-interview-form-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          titleInputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Nueva entrevista</DialogTitle>
        </DialogHeader>
        <GroupInterviewForm
          key={String(open)}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
          titleInputRef={titleInputRef}
        />
      </DialogContent>
    </Dialog>
  )
}
