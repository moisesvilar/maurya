import React, { useState } from 'react'
import { AlertTriangle, ArrowLeft, Plus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { InterviewTemplateBlockCard } from '@/components/templates/InterviewTemplateBlockCard'
import { PHASE_LABELS } from '@/components/templates/phaseLabels'
import { useInterviewTemplateEditor } from '@/hooks/useInterviewTemplateEditor'
import type { InterviewPhase } from '@/types/domain'

/** El listado es sub-página del hub de Plantillas (SPEC-012). */
const LIST_URL = '/templates/interview'

/**
 * Sentinel del Select de fase: Radix Select no admite '' como value de item,
 * así que "Sin fase" viaja como 'none' y se mapea a null en el formulario.
 */
const NO_PHASE = 'none'

/**
 * Editor de una plantilla de entrevista (SPEC-012) — Layout 3 (formulario
 * centrado, max-w 768px). Cubre `/templates/interview/new` (modo nuevo) y
 * `/templates/interview/:id` (edición). Volver/Cancelar comparten el guard de
 * cambios sin guardar (AlertDialog "Descartar cambios"); el guard compara el
 * formulario contra el snapshot cargado, sin bloquear el router.
 */
export function InterviewTemplateEditorPage(): React.ReactElement {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const editor = useInterviewTemplateEditor(id ?? null)
  const [discardOpen, setDiscardOpen] = useState(false)

  const goBackToList = (): void => {
    void navigate(LIST_URL)
  }

  /** Guard compartido de Volver y Cancelar: con cambios, AlertDialog; sin cambios, vuelta directa. */
  const handleLeave = (): void => {
    if (editor.isDirty) {
      setDiscardOpen(true)
    } else {
      goBackToList()
    }
  }

  const handleSave = (): void => {
    void editor.save().then((saved) => {
      if (saved) {
        goBackToList()
      }
    })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[768px] flex-col gap-8 px-6 pt-8">
      <div>
        <Button variant="ghost" onClick={handleLeave}>
          <ArrowLeft />
          Volver
        </Button>
      </div>
      <h1 className="text-2xl font-bold">
        {editor.mode === 'new' ? 'Nueva plantilla' : 'Editar plantilla'}
      </h1>

      {editor.loadState.status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {editor.loadState.status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{editor.loadState.message}</p>
          <Button variant="outline" onClick={editor.reload}>
            Reintentar
          </Button>
        </div>
      )}

      {editor.loadState.status === 'ready' && (
        <>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="interview-template-name">
                Nombre
              </label>
              <Input
                id="interview-template-name"
                placeholder="Entrevista de problema — MDR"
                value={editor.form.name}
                aria-invalid={editor.errors.name !== null}
                onChange={(event) => editor.setName(event.target.value)}
              />
              {editor.errors.name !== null && (
                <p className="text-sm text-destructive">{editor.errors.name}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="interview-template-phase">
                Fase
              </label>
              <Select
                value={editor.form.phase ?? NO_PHASE}
                onValueChange={(value) =>
                  editor.setPhase(value === NO_PHASE ? null : (value as InterviewPhase))
                }
              >
                <SelectTrigger id="interview-template-phase" className="w-full" aria-label="Fase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PHASE}>Sin fase</SelectItem>
                  <SelectItem value="exploratory">{PHASE_LABELS.exploratory}</SelectItem>
                  <SelectItem value="problem">{PHASE_LABELS.problem}</SelectItem>
                  <SelectItem value="solution">{PHASE_LABELS.solution}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Marco metodológico del cuestionario (The Mom Test / Running Lean)
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-semibold">Bloques</h3>
              {editor.form.blocks.map((block, index) => (
                <InterviewTemplateBlockCard
                  key={block.uid}
                  block={block}
                  index={index}
                  count={editor.form.blocks.length}
                  titleError={editor.errors.blockTitles[block.uid] ?? null}
                  questionErrors={editor.errors.questionTexts}
                  pendingFocusUid={editor.pendingFocusUid}
                  onFocusConsumed={editor.consumeFocus}
                  onChange={(patch) => editor.updateBlock(block.uid, patch)}
                  onMove={(delta) => editor.moveBlock(block.uid, delta)}
                  onRemove={() => editor.removeBlock(block.uid)}
                  onQuestionChange={(questionUid, patch) =>
                    editor.updateQuestion(block.uid, questionUid, patch)
                  }
                  onMoveQuestion={(questionUid, delta) =>
                    editor.moveQuestion(block.uid, questionUid, delta)
                  }
                  onRemoveQuestion={(questionUid) => editor.removeQuestion(block.uid, questionUid)}
                  onAddQuestion={() => editor.addQuestion(block.uid)}
                />
              ))}
              <div>
                <Button variant="outline" onClick={editor.addBlock}>
                  <Plus />
                  Añadir bloque
                </Button>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-2 border-t bg-background py-4">
            <Button variant="outline" onClick={handleLeave}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>Guardar</Button>
          </div>
        </>
      )}

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar cambios</AlertDialogTitle>
            <AlertDialogDescription>
              Hay cambios sin guardar. Si sales ahora, se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={goBackToList}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
