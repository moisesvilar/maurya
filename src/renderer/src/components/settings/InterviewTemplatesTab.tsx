import React, { useState } from 'react'
import { AlertTriangle, ClipboardList, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
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
 * Pestaña "Plantillas de entrevistas" de Ajustes (SPEC-051): unifica la gestión
 * de plantillas en Ajustes, derogando el hub de Plantillas (SPEC-009) y el
 * listado como página (SPEC-012). Reutiliza el patrón de NoteTemplatesTab: List
 * (no Table) con acciones inline Editar/Duplicar/Eliminar, empty state,
 * skeletons de carga y error state con Reintentar. Conserva de SPEC-012 el Badge
 * de fase, el resumen "N bloques · M preguntas" y el "Duplicar" inmediato (Toast
 * como feedback, sin diálogo). Al no haber ya DropdownMenu, la apertura del
 * AlertDialog de eliminación es directa (desaparece el mitigador setTimeout(0)
 * que exigía el incidente Radix dropdown → dialog de SPEC-010).
 */
export function InterviewTemplatesTab(): React.ReactElement {
  const navigate = useNavigate()
  const { state, reload, removeTemplate, duplicateTemplate } = useInterviewTemplates()
  const [pendingDelete, setPendingDelete] = useState<InterviewTemplate | null>(null)

  const goToNew = (): void => {
    void navigate('/settings/interview-templates/new')
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
          <p className="text-sm text-muted-foreground">Aún no hay plantillas de preguntas</p>
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
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Editar plantilla"
                  onClick={() => void navigate(`/settings/interview-templates/${template.id}`)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Duplicar plantilla"
                  onClick={() => void duplicateTemplate(template)}
                >
                  <Copy />
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
