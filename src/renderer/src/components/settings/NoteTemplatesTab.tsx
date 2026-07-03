import React, { useState } from 'react'
import { AlertTriangle, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useNoteTemplates } from '@/hooks/useNoteTemplates'
import type { NoteTemplate } from '@/types/domain'

function sectionCountLabel(count: number): string {
  return count === 1 ? '1 sección' : `${count} secciones`
}

/**
 * Pestaña "Plantillas de notas" de Ajustes (SPEC-008): listado (List, no
 * Table: 1-2 datos por ítem) con acciones inline Editar/Eliminar, empty state,
 * skeletons de carga y error state con Reintentar. La eliminación pasa por
 * AlertDialog con la consecuencia explícita.
 */
export function NoteTemplatesTab(): React.ReactElement {
  const navigate = useNavigate()
  const { state, reload, removeTemplate } = useNoteTemplates()
  const [pendingDelete, setPendingDelete] = useState<NoteTemplate | null>(null)

  const goToNew = (): void => {
    void navigate('/settings/note-templates/new')
  }

  const handleConfirmDelete = (): void => {
    if (pendingDelete !== null) {
      void removeTemplate(pendingDelete.id)
    }
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Moldes con los que se redactará el resumen de cada entrevista
        </p>
        <Button onClick={goToNew}>
          <Plus />
          Nueva plantilla
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
          <AlertTriangle className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      )}

      {state.status === 'ready' && state.templates.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aún no hay plantillas de notas</p>
          <Button onClick={goToNew}>Crear primera plantilla</Button>
        </div>
      )}

      {state.status === 'ready' && state.templates.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {state.templates.map((template) => (
            <li key={template.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{template.name}</span>
                <span className="text-sm text-muted-foreground">
                  {sectionCountLabel(template.sections.length)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Editar plantilla"
                  onClick={() => void navigate(`/settings/note-templates/${template.id}`)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label="Eliminar plantilla"
                  onClick={() => setPendingDelete(template)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
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
            <AlertDialogTitle>Eliminar plantilla</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la plantilla «{pendingDelete?.name ?? ''}».
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
