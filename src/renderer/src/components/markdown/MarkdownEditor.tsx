import React, { useEffect, useState } from 'react'
import { Bold, Heading2, Heading3, Italic, List, ListOrdered, Quote } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ToolbarAction {
  key: string
  label: string
  icon: LucideIcon
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

/** Toolbar mínima de la spec (SPEC-027): la sintaxis que producen guión y nota. */
const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    key: 'heading-2',
    label: 'Encabezado 2',
    icon: Heading2,
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
  },
  {
    key: 'heading-3',
    label: 'Encabezado 3',
    icon: Heading3,
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run()
  },
  {
    key: 'bold',
    label: 'Negrita',
    icon: Bold,
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run()
  },
  {
    key: 'italic',
    label: 'Cursiva',
    icon: Italic,
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run()
  },
  {
    key: 'bullet-list',
    label: 'Lista con viñetas',
    icon: List,
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run()
  },
  {
    key: 'ordered-list',
    label: 'Lista numerada',
    icon: ListOrdered,
    isActive: (editor) => editor.isActive('orderedList'),
    run: (editor) => editor.chain().focus().toggleOrderedList().run()
  },
  {
    key: 'blockquote',
    label: 'Cita',
    icon: Quote,
    isActive: (editor) => editor.isActive('blockquote'),
    run: (editor) => editor.chain().focus().toggleBlockquote().run()
  }
]

interface MarkdownEditorProps {
  /** Markdown con el que se monta el editor; los cambios salen por onChange. */
  initialMarkdown: string
  onChange: (markdown: string) => void
  ariaLabel: string
  testId: string
}

/**
 * Editor markdown WYSIWYG (SPEC-027): TipTap + extensión oficial Markdown.
 * El contenido se parsea desde Markdown al montar y se serializa de vuelta a
 * Markdown en cada actualización del documento — onChange solo se dispara con
 * ediciones reales, así el borrador del padre conserva el string original
 * hasta que el usuario toca algo (round-trip sin normalización espuria).
 * Toolbar de 7 acciones icon-only con Tooltip y estado activo (aria-pressed +
 * fondo accent); el área editable hace scroll propio si el contenido crece.
 */
export function MarkdownEditor({
  initialMarkdown,
  onChange,
  ariaLabel,
  testId
}: MarkdownEditorProps): React.ReactElement {
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: initialMarkdown,
    contentType: 'markdown',
    onUpdate: ({ editor: current }) => onChange(current.getMarkdown()),
    editorProps: {
      attributes: {
        class: 'markdown-content min-h-[336px] p-4 focus:outline-none',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel
      }
    }
  })

  // Re-render en cada transacción para refrescar el estado activo de la
  // toolbar (negrita, listas...) según la posición del cursor.
  const [, setRenderTick] = useState(0)
  useEffect(() => {
    if (editor === null) {
      return
    }
    const handleTransaction = (): void => setRenderTick((tick) => tick + 1)
    editor.on('transaction', handleTransaction)
    return () => {
      editor.off('transaction', handleTransaction)
    }
  }, [editor])

  return (
    <div data-testid={testId} className="rounded-lg border">
      <div
        role="toolbar"
        aria-label="Formato"
        className="flex flex-wrap items-center gap-1 border-b p-1"
      >
        {TOOLBAR_ACTIONS.map((action) => {
          const active = editor !== null && action.isActive(editor)
          const Icon = action.icon
          return (
            <Tooltip key={action.key}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={action.label}
                  aria-pressed={active}
                  disabled={editor === null}
                  className={cn(active && 'bg-accent text-accent-foreground')}
                  onClick={() => {
                    if (editor !== null) {
                      action.run(editor)
                    }
                  }}
                >
                  <Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{action.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
