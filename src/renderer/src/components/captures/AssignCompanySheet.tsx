import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { DisabledTooltip } from '@/components/templates/DisabledTooltip'
import type { AssignCompanyInput, AssignCompanyResult } from '@/types/captures'
import type { Company, Contact, Interview } from '@/types/domain'
import { normalizeOptional } from '@/lib/normalizeOptional'

/** Sentinels de los Selects (Radix no admite value vacío en items). */
const NEW = 'new'
const NONE = 'none'

export interface AssignCompanySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Captura sin empresa a la que asignar. */
  interview: Interview
  /** Nombre del discovery de la captura (para la descripción del Sheet). */
  discoveryName: string
  /** Notifica la asignación completada (la UI refresca sin recargar). */
  onAssigned: (result: AssignCompanyResult) => void
}

interface AssignCompanyFormProps {
  interview: Interview
  onAssigned: (result: AssignCompanyResult) => void
  onOpenChange: (open: boolean) => void
}

/**
 * Formulario interno del Sheet: vive dentro de SheetContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (patrón Dialog). La creación inline de empresa/contacto evita un
 * segundo nivel de modal (regla 11.1); la asignación es una única mutación
 * compuesta en main (atómica: si algo falla, no queda estado a medias y el
 * Sheet permanece abierto con el formulario intacto).
 */
function AssignCompanyForm({
  interview,
  onAssigned,
  onOpenChange
}: AssignCompanyFormProps): React.ReactElement {
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  // '' = sin elegir (placeholder); NEW = "+ Nueva empresa" con campos inline.
  const [companySel, setCompanySel] = useState('')
  const [contactSel, setContactSel] = useState(NONE)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyWebsite, setNewCompanyWebsite] = useState('')
  const [newCompanyLinkedin, setNewCompanyLinkedin] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [newContactPosition, setNewContactPosition] = useState('')
  const [newContactLinkedin, setNewContactLinkedin] = useState('')
  const [showCompanyError, setShowCompanyError] = useState(false)
  const [showCompanyNameError, setShowCompanyNameError] = useState(false)
  const [showContactNameError, setShowContactNameError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // SPEC-043: la asignación acepta cualquier empresa, ya no solo las del
  // discovery — se cargan TODAS las del sistema al abrir el Sheet.
  useEffect(() => {
    void window.api.db.listCompanies().then((result) => {
      if (result.ok) {
        setCompanies(result.data)
      } else {
        toast.error(result.error.message)
      }
    })
  }, [])

  // Contactos de la empresa EXISTENTE elegida, cargados lazy; con empresa
  // nueva no hay contactos que listar (solo "Sin contacto" / "+ Nuevo").
  // El reset de la lista al cambiar de empresa vive en handleCompanyChange
  // (event handler), no aquí: un setState síncrono en el effect dispararía
  // renders en cascada (react-hooks/set-state-in-effect).
  const existingCompanyId = companySel !== '' && companySel !== NEW ? companySel : null
  useEffect(() => {
    if (existingCompanyId === null) {
      return
    }
    void window.api.db.listContacts(existingCompanyId).then((result) => {
      if (result.ok) {
        setContacts(result.data)
      } else {
        toast.error(result.error.message)
      }
    })
  }, [existingCompanyId])

  const companyChosen = companySel !== ''
  const isNewCompany = companySel === NEW
  const isNewContact = contactSel === NEW

  const handleCompanyChange = (value: string): void => {
    setCompanySel(value)
    setShowCompanyError(false)
    // Cambiar de empresa invalida el contacto elegido: vuelve a "Sin contacto"
    // y vacía la lista (la de la nueva empresa se carga lazy en el effect).
    setContactSel(NONE)
    setContacts([])
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    // Validación inline on submit, SIN pasar por el bridge (AC).
    const companyMissing = !companyChosen
    const companyNameMissing = isNewCompany && newCompanyName.trim() === ''
    const contactNameMissing = isNewContact && newContactName.trim() === ''
    setShowCompanyError(companyMissing)
    setShowCompanyNameError(companyNameMissing)
    setShowContactNameError(contactNameMissing)
    if (companyMissing || companyNameMissing || contactNameMissing) {
      return
    }
    const input: AssignCompanyInput = {
      ...(isNewCompany
        ? {
            newCompany: {
              name: newCompanyName.trim(),
              website: normalizeOptional(newCompanyWebsite),
              linkedinUrl: normalizeOptional(newCompanyLinkedin)
            }
          }
        : { companyId: companySel }),
      ...(isNewContact
        ? {
            newContact: {
              name: newContactName.trim(),
              position: normalizeOptional(newContactPosition),
              linkedinUrl: normalizeOptional(newContactLinkedin)
            }
          }
        : { contactId: contactSel === NONE ? null : contactSel })
    }
    setSubmitting(true)
    void window.api.db.assignInterviewCompany(interview.id, input).then((result) => {
      setSubmitting(false)
      if (!result.ok) {
        // Sin estado a medias (lo garantiza main): el Sheet permanece abierto
        // con el formulario intacto y el error viaja por Toast destructive.
        toast.error(result.error.message)
        return
      }
      toast('Empresa asignada')
      onAssigned(result.data)
      onOpenChange(false)
    })
  }

  const contactSelect = (
    <Select value={contactSel} onValueChange={setContactSel} disabled={!companyChosen}>
      <SelectTrigger id="assign-contact" className="w-full" aria-label="Contacto">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sin contacto</SelectItem>
        {!isNewCompany &&
          contacts.map((contact) => (
            <SelectItem key={contact.id} value={contact.id}>
              {contact.name}
            </SelectItem>
          ))}
        <SelectItem value={NEW} className="font-medium">
          + Nuevo contacto
        </SelectItem>
      </SelectContent>
    </Select>
  )

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="assign-company" className="text-sm font-medium">
            Empresa
          </label>
          <Select value={companySel} onValueChange={handleCompanyChange}>
            <SelectTrigger
              id="assign-company"
              className="w-full"
              aria-label="Empresa"
              aria-invalid={showCompanyError || undefined}
            >
              <SelectValue placeholder="Selecciona una empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
              <SelectItem value={NEW} className="font-medium">
                + Nueva empresa
              </SelectItem>
            </SelectContent>
          </Select>
          {showCompanyError && <p className="text-sm text-destructive">Campo requerido</p>}
        </div>

        {isNewCompany && (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="assign-company-name" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="assign-company-name"
                value={newCompanyName}
                onChange={(event) => {
                  setNewCompanyName(event.target.value)
                  setShowCompanyNameError(false)
                }}
                aria-invalid={showCompanyNameError || undefined}
              />
              {showCompanyNameError && <p className="text-sm text-destructive">Campo requerido</p>}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="assign-company-website" className="text-sm font-medium">
                Website
              </label>
              <Input
                id="assign-company-website"
                placeholder="https://empresa.com"
                value={newCompanyWebsite}
                onChange={(event) => setNewCompanyWebsite(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="assign-company-linkedin" className="text-sm font-medium">
                LinkedIn
              </label>
              <Input
                id="assign-company-linkedin"
                placeholder="https://linkedin.com/company/..."
                value={newCompanyLinkedin}
                onChange={(event) => setNewCompanyLinkedin(event.target.value)}
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="assign-contact" className="text-sm font-medium">
            Contacto
          </label>
          {companyChosen ? (
            contactSelect
          ) : (
            // Un Select disabled no dispara eventos de puntero: el Tooltip
            // necesita el wrapper con span tabIndex 0 (patrón DisabledTooltip).
            <DisabledTooltip tooltip="Selecciona primero una empresa">
              {contactSelect}
            </DisabledTooltip>
          )}
        </div>

        {isNewContact && (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="assign-contact-name" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="assign-contact-name"
                value={newContactName}
                onChange={(event) => {
                  setNewContactName(event.target.value)
                  setShowContactNameError(false)
                }}
                aria-invalid={showContactNameError || undefined}
              />
              {showContactNameError && <p className="text-sm text-destructive">Campo requerido</p>}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="assign-contact-position" className="text-sm font-medium">
                Posición
              </label>
              <Input
                id="assign-contact-position"
                value={newContactPosition}
                onChange={(event) => setNewContactPosition(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="assign-contact-linkedin" className="text-sm font-medium">
                LinkedIn
              </label>
              <Input
                id="assign-contact-linkedin"
                placeholder="https://linkedin.com/in/..."
                value={newContactLinkedin}
                onChange={(event) => setNewContactLinkedin(event.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <SheetFooter className="flex-row items-center justify-between border-t">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Asignar
        </Button>
      </SheetFooter>
    </form>
  )
}

/**
 * Sheet "Asignar empresa y contacto" (SPEC-020): asignación diferida de
 * empresa (existente del discovery de la captura o nueva inline) y contacto
 * (existente de esa empresa, nuevo inline o "Sin contacto"). Lateral derecha,
 * ancho completo en mobile.
 */
export function AssignCompanySheet({
  open,
  onOpenChange,
  interview,
  discoveryName,
  onAssigned
}: AssignCompanySheetProps): React.ReactElement {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md" data-testid="assign-company-sheet">
        <SheetHeader>
          <SheetTitle>Asignar empresa y contacto</SheetTitle>
          <SheetDescription>
            La captura se moverá a la empresa dentro de su discovery «{discoveryName}».
          </SheetDescription>
        </SheetHeader>
        <AssignCompanyForm
          key={`${String(open)}-${interview.id}`}
          interview={interview}
          onAssigned={onAssigned}
          onOpenChange={onOpenChange}
        />
      </SheetContent>
    </Sheet>
  )
}
