import React, { useEffect, useState } from 'react'
import { ArrowLeft, Globe, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react'
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
import { ContactFormDialog } from '@/components/companies/ContactFormDialog'
import { ExternalIconLink, LinkedinIcon } from '@/components/companies/ExternalIconLink'
import { useContacts } from '@/hooks/useContacts'
import type { Company, Contact } from '@/types/domain'

type CompanyDetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; company: Company }

/** Hostname visible del enlace ("empresa.com"); si la URL no parsea, cruda. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * Detalle de una empresa (SPEC-011, ruta
 * /discoveries/:discoveryId/companies/:companyId — Layout 2 detalle, la top
 * bar sigue marcando "Discoveries" por prefijo): back button "Volver" al
 * detalle del discovery, h1 con el nombre, fila muted con los enlaces
 * externos (hostname visible) y la sección Contactos con CRUD completo.
 * Resuelve la empresa con `getCompany` (SPEC-006); un id inexistente o un
 * error del bridge muestran el error state con enlace "Volver a Discoveries".
 * Los Dialogs viven a nivel de página, FUERA del DropdownMenu, gobernados por
 * pendingEdit/pendingDelete; la apertura desde onSelect se difiere con
 * setTimeout(0) (mitigador del incidente conocido de Radix dropdown → dialog).
 */
export function CompanyDetailPage(): React.ReactElement {
  const { discoveryId, companyId } = useParams<{ discoveryId: string; companyId: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<CompanyDetailState>({ status: 'loading' })
  const {
    state: contactsState,
    createContact,
    updateContact,
    removeContact
  } = useContacts(companyId ?? '')
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<Contact | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null)

  // No marca loading por sí mismo: el estado inicial ya lo es y el efecto de
  // montaje no debe hacer setState síncrono (react-hooks/set-state-in-effect);
  // los setState viven en el callback de la promesa (patrón useNoteTemplates).
  useEffect(() => {
    void window.api.db.getCompany(companyId ?? '').then((result) => {
      if (!result.ok) {
        setState({ status: 'error', message: result.error.message })
        return
      }
      setState({ status: 'ready', company: result.data })
    })
  }, [companyId])

  const openEdit = (contact: Contact): void => {
    setTimeout(() => setPendingEdit(contact), 0)
  }

  const openDelete = (contact: Contact): void => {
    setTimeout(() => setPendingDelete(contact), 0)
  }

  const handleConfirmDelete = (): void => {
    if (pendingDelete !== null) {
      void removeContact(pendingDelete.id)
    }
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Button variant="ghost" onClick={() => void navigate(`/discoveries/${discoveryId}`)}>
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
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">{state.company.name}</h1>
            {(state.company.website !== null || state.company.linkedinUrl !== null) && (
              <div className="flex items-center gap-4 text-muted-foreground">
                {state.company.website !== null && (
                  <ExternalIconLink
                    href={state.company.website}
                    ariaLabel="Abrir website"
                    icon={Globe}
                    label={hostnameOf(state.company.website)}
                  />
                )}
                {state.company.linkedinUrl !== null && (
                  <ExternalIconLink
                    href={state.company.linkedinUrl}
                    ariaLabel="Abrir LinkedIn"
                    icon={LinkedinIcon}
                    label={hostnameOf(state.company.linkedinUrl)}
                  />
                )}
              </div>
            )}
          </div>

          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">Contactos</h3>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                Nuevo contacto
              </Button>
            </div>

            {contactsState.status === 'loading' && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {contactsState.status === 'error' && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {contactsState.message}
              </p>
            )}

            {contactsState.status === 'ready' && contactsState.contacts.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Users className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Aún no hay contactos</p>
                <Button onClick={() => setCreateOpen(true)}>Añadir primer contacto</Button>
              </div>
            )}

            {contactsState.status === 'ready' && contactsState.contacts.length > 0 && (
              <ul className="flex flex-col divide-y rounded-md border">
                {contactsState.contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{contact.name}</span>
                      {contact.position !== null && (
                        <span className="text-sm text-muted-foreground">{contact.position}</span>
                      )}
                      {contact.linkedinUrl !== null && (
                        <ExternalIconLink
                          href={contact.linkedinUrl}
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
                        <DropdownMenuItem onSelect={() => openEdit(contact)}>
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => openDelete(contact)}
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

      <ContactFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo contacto"
        submitLabel="Crear"
        onSubmit={createContact}
      />

      <ContactFormDialog
        open={pendingEdit !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingEdit(null)
          }
        }}
        title="Editar contacto"
        submitLabel="Guardar"
        contact={pendingEdit}
        onSubmit={(values) =>
          pendingEdit !== null ? updateContact(pendingEdit.id, values) : Promise.resolve(false)
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
            <AlertDialogTitle>Eliminar contacto</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente «{pendingDelete?.name ?? ''}».
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
