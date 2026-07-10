import React from 'react'
import type { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Heading2, Italic, List, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PromptMarkdownEditorProps {
  /** Markdown plano inicial (override vigente o default). Solo se lee al montar. */
  initialMarkdown: string
  /**
   * Recibe el Markdown plano serializado tras cada cambio. Debe ser una
   * referencia estable (useCallback): TipTap la captura al crear el editor.
   */
  onChange: (markdown: string) => void
  /** id del label visible que titula el editor (accesibilidad). */
  ariaLabelledBy: string
  /** Marca visual del error de validación (borde destructive). */
  invalid: boolean
}

interface ToolbarAction {
  label: string
  icon: React.ReactElement
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

/** Botonera mínima de la spec: negrita, cursiva, título, viñetas, numerada. */
const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    label: 'Negrita',
    icon: <Bold />,
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run()
  },
  {
    label: 'Cursiva',
    icon: <Italic />,
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run()
  },
  {
    label: 'Título',
    icon: <Heading2 />,
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
  },
  {
    label: 'Lista de viñetas',
    icon: <List />,
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run()
  },
  {
    label: 'Lista numerada',
    icon: <ListOrdered />,
    isActive: (editor) => editor.isActive('orderedList'),
    run: (editor) => editor.chain().focus().toggleOrderedList().run()
  }
]

/**
 * Editor Markdown WYSIWYG del bloque de persona/enfoque (SPEC-026): el texto
 * se muestra renderizado y se edita sobre la vista formateada; la botonera
 * aplica el formato y refleja el estado activo bajo el cursor. Round-trip
 * fiel string → vista → string vía @tiptap/markdown (extensión oficial v3,
 * convergencia con SPEC-027: contentType 'markdown' + editor.getMarkdown()).
 */
export function PromptMarkdownEditor({
  initialMarkdown,
  onChange,
  ariaLabelledBy,
  invalid
}: PromptMarkdownEditorProps): React.ReactElement {
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: initialMarkdown,
    contentType: 'markdown',
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'prompt-editor max-h-80 min-h-56 overflow-y-auto px-3 py-2 text-sm',
        'aria-labelledby': ariaLabelledBy,
        'aria-multiline': 'true'
      }
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.getMarkdown())
    }
  })

  return (
    <div
      className={cn(
        'rounded-md border border-input focus-within:ring-1 focus-within:ring-ring',
        invalid && 'border-destructive'
      )}
    >
      <div
        role="toolbar"
        aria-label="Formato del texto"
        data-testid="custom-prompt-editor-toolbar"
        className="flex items-center gap-1 border-b px-1 py-1"
      >
        {TOOLBAR_ACTIONS.map((action) => {
          const active = editor !== null && action.isActive(editor)
          return (
            <Button
              key={action.label}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={action.label}
              aria-pressed={active}
              disabled={editor === null}
              className={cn('size-8', active && 'bg-accent text-accent-foreground')}
              onClick={() => {
                if (editor !== null) {
                  action.run(editor)
                }
              }}
            >
              {action.icon}
            </Button>
          )
        })}
      </div>
      <EditorContent editor={editor} data-testid="custom-prompt-editor" />
    </div>
  )
}
