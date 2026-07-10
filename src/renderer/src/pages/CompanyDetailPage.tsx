import React, { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Globe,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
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
import { InterviewFormDialog } from '@/components/interviews/InterviewFormDialog'
import { STATUS_LABELS } from '@/components/interviews/statusLabels'
import { useContacts } from '@/hooks/useContacts'
import { useInterviews } from '@/hooks/useInterviews'
import { useInterviewTemplates } from '@/hooks/useInterviewTemplates'
import type { Company, Contact, Interview } from '@/types/domain'

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
  const {
    state: interviewsState,
    createInterview,
    updateInterview,
    removeInterview
  } = useInterviews(discoveryId ?? '', companyId ?? '')
  // UNA sola carga de templates a nivel de página (SPEC-013): alimenta el
  // Select del Dialog y la resolución de nombres de las filas; si el fetch
  // falla, el Select degrada a solo "Sin template" y las filas omiten el
  // nombre del template.
  const { state: templatesState } = useInterviewTemplates()
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<Contact | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null)
  const [interviewCreateOpen, setInterviewCreateOpen] = useState(false)
  const [pendingInterviewEdit, setPendingInterviewEdit] = useState<Interview | null>(null)
  const [pendingInterviewDelete, setPendingInterviewDelete] = useState<Interview | null>(null)

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

  const openInterviewEdit = (interview: Interview): void => {
    setTimeout(() => setPendingInterviewEdit(interview), 0)
  }

  const openInterviewDelete = (interview: Interview): void => {
    setTimeout(() => setPendingInterviewDelete(interview), 0)
  }

  const handleConfirmInterviewDelete = (): void => {
    if (pendingInterviewDelete !== null) {
      void removeInterview(pendingInterviewDelete.id)
    }
    setPendingInterviewDelete(null)
  }

  const contacts = contactsState.status === 'ready' ? contactsState.contacts : []
  const templates = templatesState.status === 'ready' ? templatesState.templates : []

  /**
   * Fila muted "{contacto} · {template}" (solo los nombres que existan y se
   * resuelvan con los listados ya cargados; referencias rotas se omiten).
   */
  const interviewRefsLabel = (interview: Interview): string => {
    const contactName =
      interview.contactId !== null
        ? (contacts.find((contact) => contact.id === interview.contactId)?.name ?? null)
        : null
    const templateName =
      interview.templateId !== null
        ? (templates.find((template) => template.id === interview.templateId)?.name ?? null)
        : null
    return [contactName, templateName].filter((name): name is string => name !== null).join(' · ')
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

          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">Entrevistas</h3>
              <Button onClick={() => setInterviewCreateOpen(true)}>
                <Plus />
                Nueva entrevista
              </Button>
            </div>

            {interviewsState.status === 'loading' && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {interviewsState.status === 'error' && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {interviewsState.message}
              </p>
            )}

            {interviewsState.status === 'ready' && interviewsState.interviews.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <MessagesSquare className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Aún no hay entrevistas</p>
                <Button onClick={() => setInterviewCreateOpen(true)}>
                  Crear primera entrevista
                </Button>
              </div>
            )}

            {interviewsState.status === 'ready' && interviewsState.interviews.length > 0 && (
              <ul className="flex flex-col divide-y rounded-md border">
                {interviewsState.interviews.map((interview) => {
                  const refsLabel = interviewRefsLabel(interview)
                  return (
                    <li
                      key={interview.id}
                      className="flex items-center justify-between gap-2 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/discoveries/${discoveryId}/companies/${companyId}/interviews/${interview.id}`}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {interview.title}
                        </Link>
                        <Badge variant="secondary">{STATUS_LABELS[interview.status]}</Badge>
                        {refsLabel !== '' && (
                          <span className="text-sm text-muted-foreground">{refsLabel}</span>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Acciones">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openInterviewEdit(interview)}>
                            <Pencil />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => openInterviewDelete(interview)}
                          >
                            <Trash2 />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  )
                })}
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

      <InterviewFormDialog
        open={interviewCreateOpen}
        onOpenChange={setInterviewCreateOpen}
        title="Nueva entrevista"
        submitLabel="Crear"
        companyName={state.status === 'ready' ? state.company.name : ''}
        contacts={contacts}
        templates={templates}
        onSubmit={createInterview}
      />

      <InterviewFormDialog
        open={pendingInterviewEdit !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingInterviewEdit(null)
          }
        }}
        title="Editar entrevista"
        submitLabel="Guardar"
        companyName={state.status === 'ready' ? state.company.name : ''}
        contacts={contacts}
        templates={templates}
        interview={pendingInterviewEdit}
        onSubmit={(values) =>
          pendingInterviewEdit !== null
            ? updateInterview(pendingInterviewEdit.id, values)
            : Promise.resolve(false)
        }
      />

      <AlertDialog
        open={pendingInterviewDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingInterviewDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar entrevista</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente «{pendingInterviewDelete?.title ?? ''}» y sus notas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmInterviewDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
