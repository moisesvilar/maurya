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
import type { CompanyFormValues } from '@/hooks/useCompanies'
import type { Company } from '@/types/domain'

export interface CompanyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Título del Dialog ("Nueva empresa" / "Editar empresa"). */
  title: string
  /** Texto del botón de envío ("Crear" / "Guardar"). */
  submitLabel: string
  /** Empresa precargada (edición); null/undefined para creación. */
  company?: Company | null
  /** Devuelve true si la mutación fue bien (cierra el Dialog); false lo mantiene abierto. */
  onSubmit: (values: CompanyFormValues) => Promise<boolean>
}

interface CompanyFormProps {
  submitLabel: string
  company: Company | null
  onSubmit: (values: CompanyFormValues) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  nameInputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Formulario interno del Dialog: vive dentro de DialogContent, que Radix
 * desmonta al cerrar, así que cada apertura remonta el form con el estado
 * fresco (campos precargados null → '', sin error residual) sin effects.
 */
function CompanyForm({
  submitLabel,
  company,
  onSubmit,
  onOpenChange,
  nameInputRef
}: CompanyFormProps): React.ReactElement {
  const [name, setName] = useState(company?.name ?? '')
  const [website, setWebsite] = useState(company?.website ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(company?.linkedinUrl ?? '')
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
      website: normalizeOptional(website),
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
        <label htmlFor="company-name" className="text-sm font-medium">
          Nombre
        </label>
        <Input
          ref={nameInputRef}
          id="company-name"
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
        <label htmlFor="company-website" className="text-sm font-medium">
          Website
        </label>
        <Input
          id="company-website"
          placeholder="https://empresa.com"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="company-linkedin" className="text-sm font-medium">
          LinkedIn
        </label>
        <Input
          id="company-linkedin"
          placeholder="https://linkedin.com/company/..."
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
 * Dialog de empresa (SPEC-011): crear y editar. Form real (Enter = submit
 * nativo), solo Nombre requerido (error inline "Campo requerido" sin pasar
 * por el bridge), Website/LinkedIn opcionales normalizados '' → null. Foco al
 * Nombre al abrir vía onOpenAutoFocus SIN select (divergencia deliberada del
 * renombrado de SPEC-010: aquí hay varios campos y no se reemplaza el valor).
 */
export function CompanyFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  company = null,
  onSubmit
}: CompanyFormDialogProps): React.ReactElement {
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
        <CompanyForm
          key={`${String(open)}-${company?.id ?? 'new'}`}
          submitLabel={submitLabel}
          company={company}
          onSubmit={onSubmit}
          onOpenChange={onOpenChange}
          nameInputRef={nameInputRef}
        />
      </DialogContent>
    </Dialog>
  )
}
