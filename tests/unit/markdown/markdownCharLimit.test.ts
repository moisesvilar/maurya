/**
 * Tope de caracteres del editor de guión (decisión humana 2026-07-17): la
 * extensión MarkdownCharLimit veta las transacciones cuyo markdown serializado
 * supere maxChars. Se testea con un Editor headless de TipTap (la escritura
 * libre no es reproducible en jsdom — estrategia documentada en
 * MarkdownEditor.test.tsx) insertando contenido por la API de comandos, que
 * pasa por las mismas transacciones de ProseMirror que el teclado o el pegado.
 * OJO: se aserta sobre getMarkdown(), nunca sobre el boolean del comando — el
 * valor de retorno se calcula antes del dispatch y NO refleja el veto de
 * filterTransaction.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { MarkdownCharLimit } from '../../../src/renderer/src/components/markdown/MarkdownEditor'

let editor: Editor | null = null

function createEditor(initialMarkdown: string, maxChars: number | null): Editor {
  editor = new Editor({
    extensions: [StarterKit, Markdown, MarkdownCharLimit.configure({ maxChars })],
    content: initialMarkdown,
    contentType: 'markdown'
  })
  return editor
}

/** Inserta texto al final del ÚLTIMO nodo (sin abrir un párrafo nuevo). */
function appendText(current: Editor, text: string): void {
  current.commands.insertContentAt(current.state.doc.content.size - 1, text)
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('MarkdownCharLimit', () => {
  it('allows edits while the serialized markdown stays within maxChars', () => {
    const current = createEditor('Hola', 20)

    appendText(current, ' mundo')

    expect(current.getMarkdown()).toBe('Hola mundo')
  })

  it('rejects the whole transaction (typing or paste) that would exceed maxChars', () => {
    const current = createEditor('Hola', 20)

    appendText(current, ' con un texto que se pasa del tope')

    // La transacción entera queda vetada: el contenido no cambia
    expect(current.getMarkdown()).toBe('Hola')
  })

  it('measures the MARKDOWN serialization, not the visible text (syntax counts)', () => {
    // «**Hola**» = 8 caracteres de markdown aunque el texto visible sean 4.
    const current = createEditor('**Hola**', 9)

    appendText(current, 'xx')

    expect(current.getMarkdown()).toBe('**Hola**')
  })

  it('always allows shortening legacy content that is already over the limit', () => {
    const current = createEditor('x'.repeat(30), 10)
    expect(current.getMarkdown()).toHaveLength(30)

    // Acortar por encima del límite SÍ se admite (nunca deja el contenido atrapado)
    current.commands.deleteRange({ from: 1, to: 21 })
    expect(current.getMarkdown()).toHaveLength(10)

    // ...pero crecer estando al límite sigue vetado
    appendText(current, 'yy')
    expect(current.getMarkdown()).toHaveLength(10)
  })

  it('imposes no limit when maxChars is null (default of every other editor usage)', () => {
    const current = createEditor('Hola', null)

    appendText(current, ' ' + 'x'.repeat(500))

    expect(current.getMarkdown().length).toBeGreaterThan(500)
  })
})
