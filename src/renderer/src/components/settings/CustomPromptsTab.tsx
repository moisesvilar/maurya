import React, { useState } from 'react'
import { AlertTriangle, Pencil, RotateCcw } from 'lucide-react'
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
import { DisabledTooltip } from '@/components/templates/DisabledTooltip'
import { CustomPromptSheet } from './CustomPromptSheet'
import { useCustomPrompts } from '@/hooks/useCustomPrompts'
import type { CustomPrompt, CustomPromptId } from '@/types/domain'

/** Copy del catálogo fijo (nombres y descripciones de la spec, en su orden). */
const PROMPT_LABELS: Record<CustomPromptId, { name: string; description: string }> = {
  script: {
    name: 'Guión y objetivos',
    description: 'Prepara el guión personalizado y los objetivos de cada entrevista'
  },
  note: {
    name: 'Nota de resumen',
    description: 'Sintetiza la nota de resumen al cerrar la entrevista'
  },
  assistant: {
    name: 'Asistente en vivo',
    description: 'Sugiere la siguiente jugada durante la llamada'
  }
}

/**
 * Pestaña "Prompts personalizados" de Ajustes (SPEC-026): catálogo fijo de 3
 * prompts (List, no Table: 1-2 datos por ítem, sin sorting) con Badge de
 * estado Default/Personalizado, edición en Sheet con editor Markdown WYSIWYG
 * y restablecer al default con AlertDialog. Sin empty state: el catálogo
 * siempre existe; "sin datos" = todas las filas en Default.
 */
export function CustomPromptsTab(): React.ReactElement {
  const { state, reload, savePrompt, resetPrompt } = useCustomPrompts()
  const [editingId, setEditingId] = useState<CustomPromptId | null>(null)
  const [pendingReset, setPendingReset] = useState<CustomPrompt | null>(null)

  const prompts = state.status === 'ready' ? state.prompts : []
  const editing = prompts.find((prompt) => prompt.id === editingId) ?? null

  const handleConfirmReset = (): void => {
    if (pendingReset !== null) {
      void resetPrompt(pendingReset.id)
    }
    setPendingReset(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Ajusta la persona y el enfoque con los que la IA prepara, asiste y resume tus entrevistas
      </p>

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

      {state.status === 'ready' && (
        <ul data-testid="custom-prompts-list" className="flex flex-col divide-y rounded-md border">
          {prompts.map((prompt) => {
            const labels = PROMPT_LABELS[prompt.id]
            const customized = prompt.overrideBody !== null
            return (
              <li
                key={prompt.id}
                data-testid={`custom-prompt-row-${prompt.id}`}
                className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{labels.name}</span>
                  <span className="text-sm text-muted-foreground">{labels.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={customized ? 'default' : 'secondary'}>
                    {customized ? 'Personalizado' : 'Default'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Editar prompt"
                    onClick={() => setEditingId(prompt.id)}
                  >
                    <Pencil />
                  </Button>
                  {customized ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Restablecer prompt"
                      onClick={() => setPendingReset(prompt)}
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
              </li>
            )
          })}
        </ul>
      )}

      <CustomPromptSheet
        prompt={editing}
        name={editing !== null ? PROMPT_LABELS[editing.id].name : ''}
        description={editing !== null ? PROMPT_LABELS[editing.id].description : ''}
        onSave={savePrompt}
        onClose={() => setEditingId(null)}
      />

      <AlertDialog
        open={pendingReset !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingReset(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restablecer prompt</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente tu texto personalizado y el prompt «
              {pendingReset !== null ? PROMPT_LABELS[pendingReset.id].name : ''}» volverá al texto
              por defecto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmReset}>
              Restablecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
