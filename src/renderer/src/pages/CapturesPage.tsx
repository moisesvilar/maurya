import React, { useState } from 'react'
import { AlertTriangle, Building2, MoreHorizontal, Mic, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
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
import { AssignCompanySheet } from '@/components/captures/AssignCompanySheet'
import { EditCaptureDialog } from '@/components/captures/EditCaptureDialog'
import { NewCaptureDialog } from '@/components/captures/NewCaptureDialog'
import { STATUS_LABELS } from '@/components/interviews/statusLabels'
import { useCaptures, type NewCaptureValues } from '@/hooks/useCaptures'
import { useDiscoveries } from '@/hooks/useDiscoveries'
import { useInterviewTemplates } from '@/hooks/useInterviewTemplates'
import type { CaptureListItem } from '@/types/captures'

/** Filtro del listado: 2 valores excluyentes visibles como chips (regla 7.2). */
type CapturesFilter = 'all' | 'unassigned'

/**
 * Fila muted "{discovery} · {empresa} · {contacto} · {template}": solo las
 * partes que existan y se resuelvan (referencias rotas o null se omiten; el
 * caso "Sin empresa" lo cubre el Badge outline, no este texto).
 */
function captureRefsLabel(item: CaptureListItem): string {
  return [item.discoveryName, item.companyName, item.contactName, item.templateName]
    .filter((name): name is string => name !== null && name !== '')
    .join(' · ')
}

/**
 * Listado global de capturas (SPEC-020, ruta /captures — Layout 1 estándar):
 * todas las entrevistas del sistema (con o sin empresa) ordenadas por
 * updatedAt desc en main, con filtro client-side "Sin empresa", creación
 * capture-first (Dialog con solo título + discovery + plantilla), asignación
 * diferida de empresa/contacto (Sheet) y edición/eliminación por fila.
 * Los Dialogs/Sheet viven a nivel de página, FUERA del DropdownMenu,
 * gobernados por pending*; la apertura desde onSelect se difiere con
 * setTimeout(0) (mitigador del incidente conocido de Radix dropdown → dialog).
 */
export function CapturesPage(): React.ReactElement {
  const navigate = useNavigate()
  const { state, reload, createCapture, updateCapture, removeCapture } = useCaptures()
  // UNA sola carga de discoveries/templates a nivel de página: alimenta los
  // Selects de los Dialogs; si un fetch falla, el Select degrada (patrón
  // CompanyDetailPage con templates).
  const { state: discoveriesState } = useDiscoveries()
  const { state: templatesState } = useInterviewTemplates()
  const [filter, setFilter] = useState<CapturesFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<CaptureListItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CaptureListItem | null>(null)
  const [pendingAssign, setPendingAssign] = useState<CaptureListItem | null>(null)

  const discoveries = discoveriesState.status === 'ready' ? discoveriesState.discoveries : []
  const templates = templatesState.status === 'ready' ? templatesState.templates : []

  const openEdit = (item: CaptureListItem): void => {
    setTimeout(() => setPendingEdit(item), 0)
  }

  const openDelete = (item: CaptureListItem): void => {
    setTimeout(() => setPendingDelete(item), 0)
  }

  const openAssign = (item: CaptureListItem): void => {
    setTimeout(() => setPendingAssign(item), 0)
  }

  const handleConfirmDelete = (): void => {
    if (pendingDelete !== null) {
      void removeCapture(pendingDelete.interview.id)
    }
    setPendingDelete(null)
  }

  /** Crea la captura y navega a su detalle (AC: Toast + /captures/:id). */
  const handleCreate = async (values: NewCaptureValues): Promise<boolean> => {
    const interview = await createCapture(values)
    if (interview === null) {
      return false
    }
    // SPEC-033: disparo fire-and-forget de la autogeneración del guión. Main
    // aplica los guards (sin plantilla / sin clave / guión presente) en silencio;
    // el renderer llama siempre y nunca espera (la navegación no se bloquea).
    void window.api.llm.autoGenerateScript(interview.id)
    void navigate(`/captures/${interview.id}`)
    return true
  }

  const items = state.status === 'ready' ? state.items : []
  const visibleItems =
    filter === 'unassigned' ? items.filter((item) => item.interview.companyId === null) : items

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">Capturas</h1>
        <Button className="w-full md:w-auto" onClick={() => setCreateOpen(true)}>
          <Plus />
          Nueva captura
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={filter === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          Todas
        </Button>
        <Button
          data-testid="captures-filter-unassigned"
          variant={filter === 'unassigned' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFilter('unassigned')}
        >
          Sin empresa
        </Button>
        {filter !== 'all' && (
          <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      )}

      {state.status === 'ready' && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Mic className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Aún no hay capturas</p>
          <Button onClick={() => setCreateOpen(true)}>Crear primera captura</Button>
        </div>
      )}

      {state.status === 'ready' && items.length > 0 && visibleItems.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">No hay capturas sin empresa</p>
          <Button variant="outline" onClick={() => setFilter('all')}>
            Limpiar filtros
          </Button>
        </div>
      )}

      {state.status === 'ready' && visibleItems.length > 0 && (
        <ul data-testid="captures-list" className="flex flex-col divide-y rounded-md border">
          {visibleItems.map((item) => {
            const { interview } = item
            const refsLabel = captureRefsLabel(item)
            return (
              <li key={interview.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/captures/${interview.id}`}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {interview.title}
                    </Link>
                    <Badge variant="secondary">{STATUS_LABELS[interview.status]}</Badge>
                    {interview.companyId === null && <Badge variant="outline">Sin empresa</Badge>}
                  </div>
                  {refsLabel !== '' && (
                    <span className="text-sm text-muted-foreground">{refsLabel}</span>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      data-testid="capture-row-actions"
                      variant="ghost"
                      size="icon"
                      aria-label="Acciones"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {interview.companyId === null && (
                      <DropdownMenuItem onSelect={() => openAssign(item)}>
                        <Building2 />
                        Asignar empresa y contacto
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => openEdit(item)}>
                      <Pencil />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => openDelete(item)}>
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

      <NewCaptureDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        discoveries={discoveries}
        templates={templates}
        onSubmit={handleCreate}
      />

      <EditCaptureDialog
        open={pendingEdit !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingEdit(null)
          }
        }}
        interview={pendingEdit?.interview ?? null}
        templates={templates}
        onSubmit={(values) =>
          pendingEdit !== null
            ? updateCapture(pendingEdit.interview.id, values)
            : Promise.resolve(false)
        }
      />

      {pendingAssign !== null && (
        <AssignCompanySheet
          open
          onOpenChange={(open) => {
            if (!open) {
              setPendingAssign(null)
            }
          }}
          interview={pendingAssign.interview}
          discoveryName={pendingAssign.discoveryName}
          onAssigned={() => {
            // Recarga completa: main re-resuelve empresa/contacto de la fila.
            reload()
          }}
        />
      )}

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
            <AlertDialogTitle>Eliminar captura</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente «{pendingDelete?.interview.title ?? ''}» y sus notas.
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
