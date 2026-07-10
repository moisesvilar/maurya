import React, { useCallback, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { PromptMarkdownEditor } from './PromptMarkdownEditor'
import type { CustomPrompt, CustomPromptId } from '@/types/domain'

const EMPTY_PROMPT_ERROR = 'El prompt no puede quedar vacío'

export interface CustomPromptSheetProps {
  /** Prompt en edición; null = Sheet cerrado. */
  prompt: CustomPrompt | null
  /** Nombre visible del prompt (título del Sheet). */
  name: string
  /** Descripción corta (subtítulo del Sheet). */
  description: string
  /** Persiste el override; false = fallo (el Sheet permanece abierto). */
  onSave: (id: CustomPromptId, body: string) => Promise<boolean>
  /** Cierre efectivo del Sheet (el guard de descarte ya pasó). */
  onClose: () => void
}

interface CustomPromptFormProps {
  prompt: CustomPrompt
  onSave: (id: CustomPromptId, body: string) => Promise<boolean>
  /** Cierre solicitado por Cancelar: pasa por el guard de cambios sin guardar. */
  onRequestClose: () => void
  /** Cierre directo tras guardar con éxito (sin guard). */
  onSaved: () => void
  /** Reporta si hay cambios sin guardar (para el guard de cierre del Sheet). */
  onDirtyChange: (dirty: boolean) => void
}

/**
 * Formulario interno del Sheet: Radix desmonta SheetContent al cerrar, así que
 * cada apertura remonta el form con estado fresco (patrón AssignCompanySheet).
 * El editor es no-controlado (initialMarkdown + onChange): el Markdown plano
 * del draft es la fuente de verdad de lo que se guarda.
 */
function CustomPromptForm({
  prompt,
  onSave,
  onRequestClose,
  onSaved,
  onDirtyChange
}: CustomPromptFormProps): React.ReactElement {
  const initial = prompt.overrideBody ?? prompt.defaultBody
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const initialRef = useRef(initial)

  const handleChange = useCallback(
    (markdown: string): void => {
      setDraft(markdown)
      onDirtyChange(markdown !== initialRef.current)
      // El error inline desaparece al corregir el valor (regla del design system)
      if (markdown.trim() !== '') {
        setError(null)
      }
    },
    [onDirtyChange]
  )

  const handleSave = async (): Promise<void> => {
    if (draft.trim() === '') {
      setError(EMPTY_PROMPT_ERROR)
      return
    }
    setSaving(true)
    const saved = await onSave(prompt.id, draft)
    setSaving(false)
    if (saved) {
      onSaved()
    }
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-2">
          <span id="custom-prompt-editor-label" className="text-sm font-medium">
            Persona y enfoque
          </span>
          <PromptMarkdownEditor
            initialMarkdown={initial}
            onChange={handleChange}
            ariaLabelledBy="custom-prompt-editor-label"
            invalid={error !== null}
          />
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Reglas fijas (no editables)</span>
          <div
            data-testid="custom-prompt-locked-rules"
            className="rounded-md border bg-muted px-3 py-2 text-sm whitespace-pre-wrap text-muted-foreground"
          >
            {prompt.lockedRules}
          </div>
        </div>
      </div>
      <SheetFooter className="flex-row justify-between border-t">
        <Button variant="outline" onClick={onRequestClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Guardar
        </Button>
      </SheetFooter>
    </>
  )
}

/**
 * Sheet de edición de un prompt personalizable (SPEC-026): editor Markdown
 * WYSIWYG del bloque de persona + reglas fijas en solo lectura. Cerrar con
 * cambios sin guardar (Cancelar, X, Escape o click fuera) pasa por el
 * AlertDialog "Descartar cambios"; sin cambios, cierra directamente.
 */
export function CustomPromptSheet({
  prompt,
  name,
  description,
  onSave,
  onClose
}: CustomPromptSheetProps): React.ReactElement {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const dirtyRef = useRef(false)

  const closeAndReset = (): void => {
    dirtyRef.current = false
    setConfirmDiscard(false)
    onClose()
  }

  const requestClose = (): void => {
    if (dirtyRef.current) {
      setConfirmDiscard(true)
    } else {
      closeAndReset()
    }
  }

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      requestClose()
    }
  }

  const handleDirtyChange = useCallback((dirty: boolean): void => {
    dirtyRef.current = dirty
  }, [])

  return (
    <>
      <Sheet open={prompt !== null} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full gap-0 sm:max-w-full md:max-w-lg"
          data-testid="custom-prompt-sheet"
        >
          <SheetHeader>
            <SheetTitle>Editar prompt — {name}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {prompt !== null && (
            <CustomPromptForm
              key={prompt.id}
              prompt={prompt}
              onSave={onSave}
              onRequestClose={requestClose}
              onSaved={closeAndReset}
              onDirtyChange={handleDirtyChange}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmDiscard}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDiscard(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar cambios</AlertDialogTitle>
            <AlertDialogDescription>
              Los cambios no guardados en el prompt se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={closeAndReset}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
