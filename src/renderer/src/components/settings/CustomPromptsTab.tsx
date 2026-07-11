import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CustomPromptItem } from './CustomPromptItem'
import { useCustomPrompts } from '@/hooks/useCustomPrompts'
import type { CustomPromptId } from '@/types/domain'

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
 * Pestaña "Prompts personalizados" de Ajustes (SPEC-031): acordeón con el
 * catálogo fijo de 3 prompts — cada ítem colapsado con Badge de estado
 * Default/Personalizado y edición in-place con el editor Markdown WYSIWYG al
 * pulsar el lápiz (varios pueden estar expandidos a la vez; sin Sheet lateral
 * y sin sección de reglas fijas). Sin empty state: el catálogo siempre existe;
 * "sin datos" = todas las filas en Default.
 */
export function CustomPromptsTab(): React.ReactElement {
  const { state, reload, savePrompt, resetPrompt } = useCustomPrompts()

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
          {state.prompts.map((prompt) => (
            <CustomPromptItem
              key={prompt.id}
              prompt={prompt}
              name={PROMPT_LABELS[prompt.id].name}
              description={PROMPT_LABELS[prompt.id].description}
              onSave={savePrompt}
              onReset={resetPrompt}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
