import React, { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
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
import { PHASE_LABELS } from '@/components/templates/phaseLabels'
import { useInterviewTemplates } from '@/hooks/useInterviewTemplates'
import type { InterviewTemplate } from '@/types/domain'

/** Resumen "N bloques · M preguntas" con singular/plural (SPEC-012). */
function formatSummary(template: InterviewTemplate): string {
  const blocks = template.blocks.length
  const questions = template.blocks.reduce((total, block) => total + block.questions.length, 0)
  const blocksLabel = blocks === 1 ? 'bloque' : 'bloques'
  const questionsLabel = questions === 1 ? 'pregunta' : 'preguntas'
  return `${blocks} ${blocksLabel} · ${questions} ${questionsLabel}`
}

/**
 * Listado de plantillas de entrevista (SPEC-012) — sub-página del hub de
 * Plantillas (back button "Volver" → /templates, regla 2.3). List (no Table)
 * con nombre + Badge de fase + resumen + menú ⋯ Editar/Duplicar/Eliminar.
 * El AlertDialog de eliminación vive a nivel de página, FUERA del
 * DropdownMenu, gobernado por pendingDelete; la apertura desde onSelect se
 * difiere con setTimeout(0) para que el cierre del menú no deje el body con
 * pointer-events:none (mitigador SPEC-010, incidente conocido de Radix
 * dropdown → dialog). "Duplicar" es inmediato, sin diálogo (Toast como
 * feedback).
 */
export function InterviewTemplatesPage(): React.ReactElement {
  const navigate = useNavigate()
  const { state, reload, removeTemplate, duplicateTemplate } = useInterviewTemplates()
  const [pendingDelete, setPendingDelete] = useState<InterviewTemplate | null>(null)

  const goToNew = (): void => {
    void navigate('/templates/interview/new')
  }

  const openDelete = (template: InterviewTemplate): void => {
    setTimeout(() => setPendingDelete(template), 0)
  }

  const handleConfirmDelete = (): void => {
    if (pendingDelete !== null) {
      void removeTemplate(pendingDelete.id)
    }
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Button variant="ghost" onClick={() => void navigate('/templates')}>
          <ArrowLeft />
          Volver
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Cuestionarios base para tus entrevistas: bloques ordenados de preguntas con notas de guía
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
          <AlertTriangle className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      )}

      {state.status === 'ready' && state.templates.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <ClipboardList className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Aún no hay plantillas de entrevista</p>
          <Button onClick={goToNew}>Crear primera plantilla</Button>
        </div>
      )}

      {state.status === 'ready' && state.templates.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {state.templates.map((template) => (
            <li key={template.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{template.name}</span>
                  {template.phase !== null && (
                    <Badge variant="outline">{PHASE_LABELS[template.phase]}</Badge>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">{formatSummary(template)}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Acciones">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => void navigate(`/templates/interview/${template.id}`)}
                  >
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void duplicateTemplate(template)}>
                    <Copy />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => openDelete(template)}>
                    <Trash2 />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
