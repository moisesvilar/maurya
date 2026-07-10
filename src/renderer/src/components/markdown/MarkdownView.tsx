import React, { useEffect } from 'react'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

interface MarkdownViewProps {
  markdown: string
  testId: string
}

/**
 * Vista de lectura de Markdown renderizado (SPEC-027): instancia TipTap no
 * editable con las mismas extensiones que MarkdownEditor, garantizando un
 * render idéntico en lectura y edición (encabezados, listas, énfasis, citas).
 * Sustituye al pre-wrap del guión y al parser ad-hoc de `## ` de la nota.
 */
export function MarkdownView({ markdown, testId }: MarkdownViewProps): React.ReactElement {
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: markdown,
    contentType: 'markdown',
    editable: false,
    editorProps: {
      attributes: {
        class: 'markdown-content'
      }
    }
  })

  // Refresca el render cuando cambia el contenido persistido (guardar,
  // regenerar) sin recrear el editor.
  useEffect(() => {
    if (editor === null) {
      return
    }
    if (editor.getMarkdown() !== markdown) {
      editor.commands.setContent(markdown, { contentType: 'markdown' })
    }
  }, [editor, markdown])

  return (
    <div data-testid={testId} className="rounded-lg border p-4">
      <EditorContent editor={editor} />
    </div>
  )
}
