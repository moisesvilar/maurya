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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { NoteTemplateSectionCard } from '@/components/settings/NoteTemplateSectionCard'
import { useNoteTemplateEditor } from '@/hooks/useNoteTemplateEditor'

/** El listado vive en la pestaña de plantillas de Ajustes (SPEC-008, plan §1). */
const LIST_URL = '/settings?tab=note-templates'

/**
 * Editor de una plantilla de notas (SPEC-008) — Layout 3 (formulario centrado,
 * max-w 640px). Cubre `/settings/note-templates/new` (modo nuevo) y
 * `/settings/note-templates/:id` (edición). Volver/Cancelar comparten el guard
 * de cambios sin guardar (AlertDialog "Descartar cambios"); el guard compara
 * el formulario contra el snapshot cargado, sin bloquear el router.
 */
export function NoteTemplateEditorPage(): React.ReactElement {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const editor = useNoteTemplateEditor(id ?? null)
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
    <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col gap-8 px-6 pt-8">
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
          <Skeleton className="h-24 w-full" />
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
              <label className="text-sm font-medium" htmlFor="note-template-name">
                Nombre
              </label>
              <Input
                id="note-template-name"
                placeholder="Problem Discovery"
                value={editor.form.name}
                aria-invalid={editor.errors.name !== null}
                onChange={(event) => editor.setName(event.target.value)}
              />
              {editor.errors.name !== null && (
                <p className="text-sm text-destructive">{editor.errors.name}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="note-template-context">
                Contexto
              </label>
              <Textarea
                id="note-template-context"
                rows={6}
                placeholder="Instrucciones generales: qué extraer, qué distinguir, a qué prestar atención…"
                value={editor.form.context}
                onChange={(event) => editor.setContext(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Opcional. Se antepone a las secciones al generar la nota.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-semibold">Secciones</h3>
              {editor.form.sections.map((section, index) => (
                <NoteTemplateSectionCard
                  key={section.uid}
                  section={section}
                  index={index}
                  count={editor.form.sections.length}
                  titleError={editor.errors.sectionTitles[section.uid] ?? null}
                  autoFocusTitle={editor.pendingFocusUid === section.uid}
                  onFocusConsumed={editor.consumeFocus}
                  onChange={(patch) => editor.updateSection(section.uid, patch)}
                  onMove={(delta) => editor.moveSection(section.uid, delta)}
                  onRemove={() => editor.removeSection(section.uid)}
                />
              ))}
              <div>
                <Button variant="outline" onClick={editor.addSection}>
                  <Plus />
                  Añadir sección
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
    </main>
  )
}
