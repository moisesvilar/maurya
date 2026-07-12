import React, { useCallback, useState } from 'react'
import { Loader2, Pencil, RotateCcw } from 'lucide-react'
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
import { DisabledTooltip } from '@/components/templates/DisabledTooltip'
import { PromptMarkdownEditor } from './PromptMarkdownEditor'
import type { CustomPrompt, CustomPromptId } from '@/types/domain'

const EMPTY_PROMPT_ERROR = 'El prompt no puede quedar vacío'

export interface CustomPromptItemProps {
  /** Prompt del catálogo (vista compuesta default + override). */
  prompt: CustomPrompt
  /** Nombre visible del prompt. */
  name: string
  /** Descripción corta. */
  description: string
  /** Persiste el override; false = fallo (el editor conserva el texto). */
  onSave: (id: CustomPromptId, body: string) => Promise<boolean>
  /** Elimina el override (vuelve al default); se invoca tras el AlertDialog. */
  onReset: (id: CustomPromptId) => Promise<void>
}

/**
 * Ítem del acordeón de prompts personalizados (SPEC-031): cabecera con Badge
 * Default/Personalizado + lápiz (trigger de expansión, aria-expanded) +
 * Restablecer, y panel in-place con el editor Markdown WYSIWYG. Colapso
 * controlado por ítem (sin Radix Accordion): cada ítem es independiente, así
 * que pueden estar varios expandidos a la vez. Patrón SPEC-029: draft null =
 * prístino; Guardar/Descartar solo con cambios; descartar o colapsar con
 * cambios pasa por el AlertDialog «Descartar cambios»; el editor se remonta
 * con key cuando el texto vigente cambia desde fuera (descartar/restablecer).
 */
export function CustomPromptItem({
  prompt,
  name,
  description,
  onSave,
  onReset
}: CustomPromptItemProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [editorResetKey, setEditorResetKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState<'discard' | 'collapse' | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const current = prompt.overrideBody ?? prompt.defaultBody
  const customized = prompt.overrideBody !== null
  const dirty = draft !== null && draft !== current

  const panelId = `custom-prompt-panel-${prompt.id}`
  const labelId = `custom-prompt-editor-label-${prompt.id}`

  // Referencia ESTABLE: TipTap captura el callback al crear el editor.
  const handleChange = useCallback((markdown: string): void => {
    setDraft(markdown)
    // El error inline desaparece al corregir el valor (regla del design system)
    if (markdown.trim() !== '') {
      setError(null)
    }
  }, [])

  const handleTogglePencil = (): void => {
    if (!expanded) {
      setExpanded(true)
      return
    }
    if (dirty) {
      setConfirmDiscard('collapse')
      return
    }
    setExpanded(false)
    setDraft(null)
    setError(null)
  }

  const handleSave = async (): Promise<void> => {
    if (draft === null) {
      return
    }
    if (draft.trim() === '') {
      setError(EMPTY_PROMPT_ERROR)
      return
    }
    setSaving(true)
    await onSave(prompt.id, draft)
    setSaving(false)
    // Éxito: el hook actualiza el prompt (overrideBody === draft → dirty false,
    // los botones desaparecen y el ítem sigue expandido, sin remontaje) y emite
    // el Toast. Fallo: Toast destructive del hook; el editor conserva el texto.
  }

  const handleConfirmDiscard = (): void => {
    if (confirmDiscard === 'collapse') {
      // El unmount del panel limpia el editor.
      setExpanded(false)
    } else {
      // Remonta el editor con el texto vigente; el ítem sigue expandido.
      setEditorResetKey((key) => key + 1)
    }
    setDraft(null)
    setError(null)
    setConfirmDiscard(null)
  }

  const handleConfirmReset = async (): Promise<void> => {
    await onReset(prompt.id)
    // Resincronización (SPEC-031): el prompt actualizado (default) y el bump de
    // la key se commitean juntos (batching React 19) → el editor remonta con el
    // texto default, sin cambios pendientes.
    if (expanded) {
      setDraft(null)
      setError(null)
      setEditorResetKey((key) => key + 1)
    }
  }

  return (
    <li data-testid={`custom-prompt-row-${prompt.id}`} className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={customized ? 'default' : 'secondary'}>
            {customized ? 'Personalizado' : 'Default'}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar prompt"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={handleTogglePencil}
          >
            <Pencil />
          </Button>
          {customized ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Restablecer prompt"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw />
            </Button>
          ) : (
            <DisabledTooltip tooltip="Este prompt ya usa el texto por defecto">
              <Button variant="ghost" size="icon" aria-label="Restablecer prompt" disabled>
                <RotateCcw />
              </Button>
            </DisabledTooltip>
          )}
        </div>
      </div>

      {expanded && (
        <div id={panelId} data-testid={panelId} className="flex flex-col gap-2">
          <span id={labelId} className="text-sm font-medium">
            Persona y enfoque
          </span>
          <PromptMarkdownEditor
            key={editorResetKey}
            initialMarkdown={current}
            onChange={handleChange}
            ariaLabelledBy={labelId}
            invalid={error !== null}
          />
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
          {dirty && (
            <div
              data-testid={`custom-prompt-actions-${prompt.id}`}
              className="flex justify-end gap-2"
            >
              <Button
                variant="outline"
                onClick={() => setConfirmDiscard('discard')}
                disabled={saving}
              >
                Descartar
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                Guardar
              </Button>
            </div>
          )}
        </div>
      )}

      <AlertDialog
        open={confirmDiscard !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDiscard(null)
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
            <AlertDialogAction variant="destructive" onClick={handleConfirmDiscard}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmReset}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmReset(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restablecer prompt</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente tu texto personalizado y el prompt «{name}» volverá al
              texto por defecto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleConfirmReset()}>
              Restablecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
