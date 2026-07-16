import React, { useState } from 'react'
import { Building2, Globe, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { CompanyFormDialog } from '@/components/companies/CompanyFormDialog'
import { ExternalIconLink, LinkedinIcon } from '@/components/companies/ExternalIconLink'
import { useCompanies } from '@/hooks/useCompanies'
import type { Company } from '@/types/domain'

/**
 * Listado global de empresas (SPEC-044, ruta /companies — Layout 1 estándar):
 * TODAS las empresas del sistema en una List con CRUD completo, trasladado
 * desde la sección Empresas del detalle de discovery (SPEC-011). Los toasts
 * de mutación los emite useCompanies; la página no los duplica. Los Dialogs
 * viven a nivel de página, FUERA del DropdownMenu, gobernados por
 * pendingEdit/pendingDelete; la apertura desde onSelect se difiere con
 * setTimeout(0) (mitigador del incidente conocido de Radix dropdown → dialog).
 * El AlertDialog de borrado refleja la cascada v3 (derogación del texto de
 * SPEC-011): contactos se eliminan, entrevistas se conservan sin empresa.
 */
export function CompaniesPage(): React.ReactElement {
  const { state, createCompany, updateCompany, removeCompany } = useCompanies()
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<Company | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Company | null>(null)

  const openEdit = (company: Company): void => {
    setTimeout(() => setPendingEdit(company), 0)
  }

  const openDelete = (company: Company): void => {
    setTimeout(() => setPendingDelete(company), 0)
  }

  const handleConfirmDelete = (): void => {
    if (pendingDelete !== null) {
      void removeCompany(pendingDelete.id)
    }
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <Button className="w-full md:w-auto" onClick={() => setCreateOpen(true)}>
          <Plus />
          Nueva empresa
        </Button>
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <p className="py-12 text-center text-sm text-muted-foreground">{state.message}</p>
      )}

      {state.status === 'ready' && state.companies.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Building2 className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Aún no hay empresas</p>
          <Button onClick={() => setCreateOpen(true)}>Añadir primera empresa</Button>
        </div>
      )}

      {state.status === 'ready' && state.companies.length > 0 && (
        <ul data-testid="companies-list" className="flex flex-col divide-y rounded-md border">
          {state.companies.map((company) => (
            <li key={company.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Link
                  to={`/companies/${company.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {company.name}
                </Link>
                {company.website !== null && (
                  <ExternalIconLink href={company.website} ariaLabel="Abrir website" icon={Globe} />
                )}
                {company.linkedinUrl !== null && (
                  <ExternalIconLink
                    href={company.linkedinUrl}
                    ariaLabel="Abrir LinkedIn"
                    icon={LinkedinIcon}
                  />
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    data-testid="company-row-actions"
                    variant="ghost"
                    size="icon"
                    aria-label="Acciones"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => openEdit(company)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => openDelete(company)}>
                    <Trash2 />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <CompanyFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nueva empresa"
        submitLabel="Crear"
        onSubmit={createCompany}
      />

      <CompanyFormDialog
        open={pendingEdit !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingEdit(null)
          }
        }}
        title="Editar empresa"
        submitLabel="Guardar"
        company={pendingEdit}
        onSubmit={(values) =>
          pendingEdit !== null ? updateCompany(pendingEdit.id, values) : Promise.resolve(false)
        }
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente «{pendingDelete?.name ?? ''}» y sus contactos. Sus
              entrevistas se conservarán sin empresa asignada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
