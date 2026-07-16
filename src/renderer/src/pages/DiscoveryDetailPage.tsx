import React, { useEffect, useState } from 'react'
import { ArrowLeft, Building2, Globe, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import type { Company, Discovery } from '@/types/domain'

type DiscoveryDetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; discovery: Discovery }

/**
 * Detalle de un discovery: back button "Volver" (página de detalle,
 * profundidad 2 — regla 2.3), h1 con el nombre (SPEC-010) y la sección
 * Empresas con CRUD completo (SPEC-011): alta/edición en Dialog, eliminación
 * con AlertDialog de cascada explícita, nombre-Link al detalle de empresa e
 * iconos-enlace externos condicionales. Resuelve el discovery con
 * `listDiscoveries` + find por id (nota técnica: volumen trivial); un id
 * inválido o un error del bridge muestran el error state con enlace
 * "Volver a Discoveries". Los Dialogs viven a nivel de página, FUERA del
 * DropdownMenu, gobernados por pendingEdit/pendingDelete; la apertura desde
 * onSelect se difiere con setTimeout(0) (mitigador del incidente conocido de
 * Radix dropdown → dialog, patrón DiscoveriesPage).
 */
export function DiscoveryDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<DiscoveryDetailState>({ status: 'loading' })
  const { state: companiesState, createCompany, updateCompany, removeCompany } = useCompanies()
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<Company | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Company | null>(null)

  // No marca loading por sí mismo: el estado inicial ya lo es y el efecto de
  // montaje no debe hacer setState síncrono (react-hooks/set-state-in-effect);
  // los setState viven en el callback de la promesa (patrón useNoteTemplates).
  // La UI no navega detalle→detalle, así que no hay estado stale entre ids.
  useEffect(() => {
    void window.api.db.listDiscoveries().then((result) => {
      if (!result.ok) {
        setState({ status: 'error', message: result.error.message })
        return
      }
      const discovery = result.data.find((candidate) => candidate.id === id)
      if (discovery === undefined) {
        setState({ status: 'error', message: 'Discovery no encontrado' })
        return
      }
      setState({ status: 'ready', discovery })
    })
  }, [id])

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
      <div>
        <Button variant="ghost" onClick={() => void navigate('/discoveries')}>
          <ArrowLeft />
          Volver
        </Button>
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Link to="/discoveries" className="text-sm font-medium underline underline-offset-4">
            Volver a Discoveries
          </Link>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <h1 className="text-2xl font-semibold">{state.discovery.name}</h1>
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">Empresas</h3>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                Nueva empresa
              </Button>
            </div>

            {companiesState.status === 'loading' && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {companiesState.status === 'error' && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {companiesState.message}
              </p>
            )}

            {companiesState.status === 'ready' && companiesState.companies.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Building2 className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Aún no hay empresas</p>
                <Button onClick={() => setCreateOpen(true)}>Añadir primera empresa</Button>
              </div>
            )}

            {companiesState.status === 'ready' && companiesState.companies.length > 0 && (
              <ul className="flex flex-col divide-y rounded-md border">
                {companiesState.companies.map((company) => (
                  <li
                    key={company.id}
                    className="flex items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/discoveries/${id}/companies/${company.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {company.name}
                      </Link>
                      {company.website !== null && (
                        <ExternalIconLink
                          href={company.website}
                          ariaLabel="Abrir website"
                          icon={Globe}
                        />
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
                        <Button variant="ghost" size="icon" aria-label="Acciones">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(company)}>
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => openDelete(company)}
                        >
                          <Trash2 />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
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
              Se eliminarán permanentemente «{pendingDelete?.name ?? ''}» y todos sus contactos y
              entrevistas.
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
