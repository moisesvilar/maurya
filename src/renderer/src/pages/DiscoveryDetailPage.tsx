import React, { useState } from 'react'
import { ArrowLeft, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { DiscoveryNameDialog } from '@/components/discoveries/DiscoveryNameDialog'
import { InterviewGroupFormDialog } from '@/components/discoveries/InterviewGroupFormDialog'
import { useDiscoveries } from '@/hooks/useDiscoveries'
import { useInterviewGroups } from '@/hooks/useInterviewGroups'
import { useInterviewTemplates } from '@/hooks/useInterviewTemplates'
import { useNoteTemplates } from '@/hooks/useNoteTemplates'
import type { InterviewGroup } from '@/types/domain'

/**
 * Detalle de un discovery (SPEC-010; SPEC-045 lo rellena con objetivos y
 * grupos de entrevistas): back button "Volver" (página de detalle,
 * profundidad 2 — regla 2.3), cabecera con h1 + botón "Editar" (mismo Dialog
 * de discovery del listado), sección "Objetivos" (texto libre con saltos de
 * línea respetados) y sección "Grupos de entrevistas" con CRUD completo
 * (Dialog de 4 campos, AlertDialog de borrado — las entrevistas del grupo se
 * conservan sin grupo, SET NULL de SPEC-043). SPEC-046: el nombre de cada
 * fila de grupo es un Link a su detalle (deroga el «no navegan» de SPEC-045;
 * el resto de la fila y su menú ⋯ no cambian). Resuelve el discovery vía
 * `useDiscoveries` + find por id (volumen trivial); un id inválido o un error
 * del bridge muestran el error state con enlace "Volver a Discoveries". Los
 * templates se cargan UNA vez a nivel de página: alimentan los Selects del
 * Dialog de grupo y la resolución de nombres de las filas (un template
 * borrado deja "Sin template …" sin crash). Los Dialogs viven a nivel de
 * página, FUERA del DropdownMenu, gobernados por pendingEditGroup/
 * pendingDeleteGroup; la apertura desde onSelect se difiere con setTimeout(0)
 * (mitigador del incidente conocido de Radix dropdown → dialog).
 */
export function DiscoveryDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { state: discoveriesState, updateDiscovery } = useDiscoveries()
  const { state: groupsState, createGroup, updateGroup, removeGroup } = useInterviewGroups(id ?? '')
  // UNA sola carga de cada catálogo de templates (patrón SPEC-013): alimenta
  // los Selects del Dialog de grupo y los nombres de las filas; si el fetch
  // falla, los Selects degradan a solo "Sin template" y las filas muestran
  // "Sin template …".
  const { state: interviewTemplatesState } = useInterviewTemplates()
  const { state: noteTemplatesState } = useNoteTemplates()
  const [editDiscoveryOpen, setEditDiscoveryOpen] = useState(false)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [pendingEditGroup, setPendingEditGroup] = useState<InterviewGroup | null>(null)
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<InterviewGroup | null>(null)

  const discovery =
    discoveriesState.status === 'ready'
      ? discoveriesState.discoveries.find((candidate) => candidate.id === id)
      : undefined

  const interviewTemplates =
    interviewTemplatesState.status === 'ready' ? interviewTemplatesState.templates : []
  const noteTemplates = noteTemplatesState.status === 'ready' ? noteTemplatesState.templates : []

  const openEditGroup = (group: InterviewGroup): void => {
    setTimeout(() => setPendingEditGroup(group), 0)
  }

  const openDeleteGroup = (group: InterviewGroup): void => {
    setTimeout(() => setPendingDeleteGroup(group), 0)
  }

  const handleConfirmDeleteGroup = (): void => {
    if (pendingDeleteGroup !== null) {
      void removeGroup(pendingDeleteGroup.id)
    }
    setPendingDeleteGroup(null)
  }

  /** Nombre del template de preguntas de la fila; null u huérfano (SET NULL) → hueco. */
  const interviewTemplateName = (group: InterviewGroup): string => {
    const template = interviewTemplates.find(
      (candidate) => candidate.id === group.interviewTemplateId
    )
    return template?.name ?? 'Sin template de preguntas'
  }

  /** Nombre del template de notas de la fila; null u huérfano (SET NULL) → hueco. */
  const noteTemplateName = (group: InterviewGroup): string => {
    const template = noteTemplates.find((candidate) => candidate.id === group.noteTemplateId)
    return template?.name ?? 'Sin template de notas'
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Button variant="ghost" onClick={() => void navigate('/discoveries')}>
          <ArrowLeft />
          Volver
        </Button>
      </div>

      {discoveriesState.status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {(discoveriesState.status === 'error' ||
        (discoveriesState.status === 'ready' && discovery === undefined)) && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {discoveriesState.status === 'error'
              ? discoveriesState.message
              : 'Discovery no encontrado'}
          </p>
          <Link to="/discoveries" className="text-sm font-medium underline underline-offset-4">
            Volver a Discoveries
          </Link>
        </div>
      )}

      {discovery !== undefined && (
        <>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">{discovery.name}</h1>
            <Button variant="outline" onClick={() => setEditDiscoveryOpen(true)}>
              <Pencil />
              Editar
            </Button>
          </div>

          <section className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">Objetivos</h3>
            {discovery.objectives !== null && discovery.objectives.trim() !== '' ? (
              <p data-testid="discovery-objectives" className="text-sm whitespace-pre-wrap">
                {discovery.objectives}
              </p>
            ) : (
              <p data-testid="discovery-objectives" className="text-sm text-muted-foreground">
                Aún no hay objetivos
              </p>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h3 className="text-lg font-semibold">Grupos de entrevistas</h3>
              <Button className="w-full md:w-auto" onClick={() => setCreateGroupOpen(true)}>
                <Plus />
                Nuevo grupo
              </Button>
            </div>

            {groupsState.status === 'loading' && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {groupsState.status === 'error' && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {groupsState.message}
              </p>
            )}

            {groupsState.status === 'ready' && groupsState.groups.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Layers className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Aún no hay grupos de entrevistas</p>
                <Button onClick={() => setCreateGroupOpen(true)}>Crear primer grupo</Button>
              </div>
            )}

            {groupsState.status === 'ready' && groupsState.groups.length > 0 && (
              <ul
                data-testid="interview-groups-list"
                className="flex flex-col divide-y rounded-md border"
              >
                {groupsState.groups.map((group) => (
                  <li key={group.id} className="flex items-center justify-between gap-2 px-4 py-3">
                    {/* Mobile: refs de templates bajo el nombre; desktop: a la derecha */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-4">
                      <div className="flex min-w-0 flex-col">
                        {/* SPEC-046: el nombre navega al detalle del grupo
                            (deroga el «no navegan» de SPEC-045). */}
                        <Link
                          to={`/discoveries/${id ?? ''}/groups/${group.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {group.name}
                        </Link>
                        {group.objective !== null && (
                          <span className="truncate text-sm text-muted-foreground">
                            {group.objective}
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground md:shrink-0">
                        {interviewTemplateName(group)} · {noteTemplateName(group)}
                      </span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Acciones"
                          data-testid="group-row-actions"
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEditGroup(group)}>
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => openDeleteGroup(group)}
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

          <DiscoveryNameDialog
            open={editDiscoveryOpen}
            onOpenChange={setEditDiscoveryOpen}
            title="Editar discovery"
            submitLabel="Guardar"
            initialName={discovery.name}
            initialObjectives={discovery.objectives ?? ''}
            onSubmit={(values) => updateDiscovery(discovery.id, values)}
          />

          <InterviewGroupFormDialog
            open={createGroupOpen}
            onOpenChange={setCreateGroupOpen}
            title="Nuevo grupo"
            submitLabel="Crear"
            interviewTemplates={interviewTemplates}
            noteTemplates={noteTemplates}
            onSubmit={createGroup}
          />

          <InterviewGroupFormDialog
            open={pendingEditGroup !== null}
            onOpenChange={(open) => {
              if (!open) {
                setPendingEditGroup(null)
              }
            }}
            title="Editar grupo"
            submitLabel="Guardar"
            interviewTemplates={interviewTemplates}
            noteTemplates={noteTemplates}
            group={pendingEditGroup}
            onSubmit={(values) =>
              pendingEditGroup !== null
                ? updateGroup(pendingEditGroup.id, values)
                : Promise.resolve(false)
            }
          />

          <AlertDialog
            open={pendingDeleteGroup !== null}
            onOpenChange={(open) => {
              if (!open) {
                setPendingDeleteGroup(null)
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar grupo</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará «{pendingDeleteGroup?.name ?? ''}». Sus entrevistas se conservarán
                  sin grupo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleConfirmDeleteGroup}>
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}
