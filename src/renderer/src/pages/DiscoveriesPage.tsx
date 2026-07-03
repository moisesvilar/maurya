import React, { useState } from 'react'
import { AlertTriangle, FolderSearch, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { DiscoveryNameDialog } from '@/components/discoveries/DiscoveryNameDialog'
import { useDiscoveries } from '@/hooks/useDiscoveries'
import type { Discovery } from '@/types/domain'

/** Fecha de creación en es-ES: "4 jul 2026" (nota técnica SPEC-010). */
function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

/**
 * Sección Discoveries (SPEC-010): listado (List, no Table — 2 datos por ítem)
 * ordenado por updatedAt desc, con creación/renombrado en Dialog reutilizable,
 * eliminación con AlertDialog (consecuencia de cascada explícita, SPEC-006) y
 * menú de acciones ⋯ por fila. Los Dialogs viven a nivel de página, FUERA del
 * DropdownMenu, gobernados por pendingRename/pendingDelete; la apertura desde
 * onSelect se difiere con setTimeout(0) para que el cierre del menú no deje el
 * body con pointer-events:none (mitigador del plan, incidente conocido de
 * Radix dropdown → dialog).
 */
export function DiscoveriesPage(): React.ReactElement {
  const { state, reload, createDiscovery, renameDiscovery, removeDiscovery } = useDiscoveries()
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingRename, setPendingRename] = useState<Discovery | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Discovery | null>(null)

  const openRename = (discovery: Discovery): void => {
    setTimeout(() => setPendingRename(discovery), 0)
  }

  const openDelete = (discovery: Discovery): void => {
    setTimeout(() => setPendingDelete(discovery), 0)
  }

  const handleConfirmDelete = (): void => {
    if (pendingDelete !== null) {
      void removeDiscovery(pendingDelete.id)
    }
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Cada discovery agrupa las entrevistas de una investigación
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Nuevo discovery
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
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      )}

      {state.status === 'ready' && state.discoveries.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FolderSearch className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Aún no hay discoveries</p>
          <Button onClick={() => setCreateOpen(true)}>Crear primer discovery</Button>
        </div>
      )}

      {state.status === 'ready' && state.discoveries.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {state.discoveries.map((discovery) => (
            <li key={discovery.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex flex-col">
                <Link
                  to={`/discoveries/${discovery.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {discovery.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  Creado el {formatCreatedAt(discovery.createdAt)}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Acciones">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => openRename(discovery)}>
                    <Pencil />
                    Renombrar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => openDelete(discovery)}>
                    <Trash2 />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <DiscoveryNameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo discovery"
        submitLabel="Crear"
        onSubmit={createDiscovery}
      />

      <DiscoveryNameDialog
        open={pendingRename !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRename(null)
          }
        }}
        title="Renombrar discovery"
        submitLabel="Guardar"
        initialName={pendingRename?.name ?? ''}
        onSubmit={(name) =>
          pendingRename !== null ? renameDiscovery(pendingRename.id, name) : Promise.resolve(false)
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
            <AlertDialogTitle>Eliminar discovery</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente «{pendingDelete?.name ?? ''}» y todas sus empresas,
              contactos, entrevistas y notas.
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
