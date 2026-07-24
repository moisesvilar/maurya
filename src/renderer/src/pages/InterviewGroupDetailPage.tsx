import React, { useState } from 'react'
import { ArrowLeft, FolderInput, Mic, MoreHorizontal, Pencil, Plus } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { GroupInterviewFormDialog } from '@/components/interviews/GroupInterviewFormDialog'
import { InterviewGroupFormDialog } from '@/components/discoveries/InterviewGroupFormDialog'
import { MoveInterviewDialog } from '@/components/interviews/MoveInterviewDialog'
import { STATUS_LABELS } from '@/components/interviews/statusLabels'
import { useGroupInterviews, type GroupInterviewFormValues } from '@/hooks/useGroupInterviews'
import { useInterviewGroups } from '@/hooks/useInterviewGroups'
import { useInterviewTemplates } from '@/hooks/useInterviewTemplates'
import { useNoteTemplates } from '@/hooks/useNoteTemplates'
import type { CaptureListItem } from '@/types/captures'

/**
 * Detalle de un grupo de entrevistas (SPEC-046, ruta
 * /discoveries/:discoveryId/groups/:groupId — Layout 2 detalle): back button
 * "Volver" al detalle del discovery, cabecera con el nombre del grupo +
 * botón "Editar" (mismo Dialog de grupo de SPEC-045, precargado), objetivo y
 * línea de templates bajo el título, y sección "Entrevistas" con el listado
 * del grupo (createdAt asc) y el Dialog "Nueva entrevista" (empresa global +
 * N participantes; template heredado del grupo). Resuelve el grupo vía
 * `useInterviewGroups(discoveryId)` + find por id (volumen trivial, patrón
 * DiscoveryDetailPage); un id inválido o un error del bridge muestran el
 * error state con enlace "Volver al discovery". El título de cada fila
 * navega a la ruta anidada de detalle de entrevista; si su empresa fue
 * borrada (companyId null), a /captures/:id (detalle universal, SPEC-020).
 * Cada fila lleva un menú ⋯ con "Mover a otro grupo" (Select con los grupos
 * del discovery sin el actual); el Dialog vive a nivel de página, FUERA del
 * DropdownMenu, gobernado por pendingMoveInterview, y la apertura desde
 * onSelect se difiere con setTimeout(0) (mitigador del incidente conocido de
 * Radix dropdown → dialog, patrón DiscoveryDetailPage).
 */
export function InterviewGroupDetailPage(): React.ReactElement {
  const { discoveryId, groupId } = useParams<{ discoveryId: string; groupId: string }>()
  const navigate = useNavigate()
  const { state: groupsState, updateGroup } = useInterviewGroups(discoveryId ?? '')
  const {
    state: interviewsState,
    createInterview,
    moveInterview
  } = useGroupInterviews(groupId ?? '')
  // UNA sola carga de cada catálogo de templates (patrón SPEC-045): alimenta
  // los Selects del Dialog de edición del grupo y la línea de la cabecera; si
  // el fetch falla, degradan a "Sin template …".
  const { state: interviewTemplatesState } = useInterviewTemplates()
  const { state: noteTemplatesState } = useNoteTemplates()
  const [editGroupOpen, setEditGroupOpen] = useState(false)
  const [createInterviewOpen, setCreateInterviewOpen] = useState(false)
  const [pendingMoveInterview, setPendingMoveInterview] = useState<CaptureListItem | null>(null)

  const group =
    groupsState.status === 'ready'
      ? groupsState.groups.find((candidate) => candidate.id === groupId)
      : undefined

  /** Grupos destino del Dialog de mover: los del discovery SIN el actual. */
  const moveTargetGroups =
    groupsState.status === 'ready'
      ? groupsState.groups.filter((candidate) => candidate.id !== groupId)
      : []

  const openMoveInterview = (item: CaptureListItem): void => {
    setTimeout(() => setPendingMoveInterview(item), 0)
  }

  const interviewTemplates =
    interviewTemplatesState.status === 'ready' ? interviewTemplatesState.templates : []
  const noteTemplates = noteTemplatesState.status === 'ready' ? noteTemplatesState.templates : []

  /** Nombre del template de preguntas del grupo; null u huérfano → hueco. */
  const interviewTemplateName =
    interviewTemplates.find((candidate) => candidate.id === group?.interviewTemplateId)?.name ??
    'Sin template de preguntas'

  /** Nombre del template de notas del grupo; null u huérfano → hueco. */
  const noteTemplateName =
    noteTemplates.find((candidate) => candidate.id === group?.noteTemplateId)?.name ??
    'Sin template de notas'

  /** Ruta del detalle de la entrevista: anidada con empresa; sin ella, captura. */
  const interviewLink = (item: CaptureListItem): string =>
    item.interview.companyId !== null
      ? `/discoveries/${item.interview.discoveryId}/companies/${item.interview.companyId}/interviews/${item.interview.id}`
      : `/captures/${item.interview.id}`

  const handleCreate = async (values: GroupInterviewFormValues): Promise<boolean> => {
    if (group === undefined) {
      return false
    }
    const interview = await createInterview(group, values)
    if (interview === null) {
      return false
    }
    // La empresa es requerida en este Dialog: la ruta anidada siempre aplica.
    void navigate(
      `/discoveries/${group.discoveryId}/companies/${values.companyId}/interviews/${interview.id}`
    )
    return true
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Button variant="ghost" onClick={() => void navigate(`/discoveries/${discoveryId ?? ''}`)}>
          <ArrowLeft />
          Volver
        </Button>
      </div>

      {groupsState.status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {(groupsState.status === 'error' ||
        (groupsState.status === 'ready' && group === undefined)) && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {groupsState.status === 'error' ? groupsState.message : 'Grupo no encontrado'}
          </p>
          <Link
            to={`/discoveries/${discoveryId ?? ''}`}
            className="text-sm font-medium underline underline-offset-4"
          >
            Volver al discovery
          </Link>
        </div>
      )}

      {group !== undefined && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-semibold">{group.name}</h1>
              <Button variant="outline" onClick={() => setEditGroupOpen(true)}>
                <Pencil />
                Editar
              </Button>
            </div>
            {group.objective !== null && group.objective.trim() !== '' ? (
              <p className="text-sm whitespace-pre-wrap">{group.objective}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin objetivo</p>
            )}
            <p className="text-sm text-muted-foreground">
              {interviewTemplateName} · {noteTemplateName}
            </p>
          </div>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h3 className="text-lg font-semibold">Entrevistas</h3>
              <Button className="w-full md:w-auto" onClick={() => setCreateInterviewOpen(true)}>
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

            {interviewsState.status === 'ready' && interviewsState.items.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Mic className="size-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Aún no hay entrevistas en este grupo
                </p>
                <Button onClick={() => setCreateInterviewOpen(true)}>
                  Crear primera entrevista
                </Button>
              </div>
            )}

            {interviewsState.status === 'ready' && interviewsState.items.length > 0 && (
              <ul
                data-testid="group-interviews-list"
                className="flex flex-col divide-y rounded-md border"
              >
                {interviewsState.items.map((item) => (
                  <li
                    key={item.interview.id}
                    className="flex items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <Link
                          to={interviewLink(item)}
                          className="text-sm font-medium hover:underline"
                        >
                          {item.interview.title}
                        </Link>
                        <Badge variant="secondary">{STATUS_LABELS[item.interview.status]}</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {item.companyName ?? 'Sin empresa'} ·{' '}
                        {item.contactNames.length > 0
                          ? item.contactNames.join(', ')
                          : 'Sin contacto'}
                      </span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Acciones"
                          data-testid="interview-row-actions"
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openMoveInterview(item)}>
                          <FolderInput />
                          Mover a otro grupo
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <InterviewGroupFormDialog
            open={editGroupOpen}
            onOpenChange={setEditGroupOpen}
            title="Editar grupo"
            submitLabel="Guardar"
            interviewTemplates={interviewTemplates}
            noteTemplates={noteTemplates}
            group={group}
            onSubmit={(values) => updateGroup(group.id, values)}
          />

          <GroupInterviewFormDialog
            open={createInterviewOpen}
            onOpenChange={setCreateInterviewOpen}
            onSubmit={handleCreate}
          />

          <MoveInterviewDialog
            open={pendingMoveInterview !== null}
            onOpenChange={(open) => {
              if (!open) {
                setPendingMoveInterview(null)
              }
            }}
            interviewTitle={pendingMoveInterview?.interview.title ?? ''}
            groups={moveTargetGroups}
            onSubmit={(targetGroupId) => {
              if (pendingMoveInterview === null) {
                return Promise.resolve(false)
              }
              return moveInterview(pendingMoveInterview.interview.id, targetGroupId)
            }}
          />
        </>
      )}
    </div>
  )
}
