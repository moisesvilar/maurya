import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { InterviewPhase, TemplateBlock } from '@/types/domain'

/**
 * Pregunta del editor: `guidance` vive como string ('' = vacía) para simplificar
 * los inputs controlados; al persistir se OMITE la clave si está vacía (el
 * contrato de SPEC-006 la declara `?: string`). El `uid` de cliente NO se
 * persiste: da keys estables y foco direccionable (patrón SPEC-008).
 */
export interface EditorQuestion {
  uid: string
  text: string
  guidance: string
}

export interface EditorBlock {
  uid: string
  title: string
  guidance: string
  /** Lista ordenada: el orden visual del editor es el orden persistido. */
  questions: EditorQuestion[]
}

export interface EditorForm {
  name: string
  phase: InterviewPhase | null
  /** Lista ordenada: el orden visual del editor es el orden persistido. */
  blocks: EditorBlock[]
}

/**
 * Errores en mapas PLANOS por uid: los UUIDs no colisionan entre niveles,
 * así que no hace falta anidar preguntas bajo su bloque.
 */
export interface EditorErrors {
  /** "Campo requerido" bajo el nombre, o null. */
  name: string | null
  /** uid de bloque → "Campo requerido" bajo su título. */
  blockTitles: Record<string, string>
  /** uid de pregunta → "Campo requerido" bajo su texto. */
  questionTexts: Record<string, string>
}

/** Estado de la carga inicial en modo edición (en modo nuevo siempre ready). */
export type EditorLoadState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' }

export interface UseInterviewTemplateEditorResult {
  mode: 'new' | 'edit'
  loadState: EditorLoadState
  form: EditorForm
  errors: EditorErrors
  /** true si el formulario difiere del snapshot cargado (guard de Volver/Cancelar). */
  isDirty: boolean
  /**
   * uid del elemento recién añadido que debe recibir el foco: el TÍTULO si es
   * un bloque, el texto si es una pregunta. Un solo valor para ambos niveles
   * (los uids no colisionan).
   */
  pendingFocusUid: string | null
  setName: (name: string) => void
  setPhase: (phase: InterviewPhase | null) => void
  updateBlock: (uid: string, patch: Partial<Pick<EditorBlock, 'title' | 'guidance'>>) => void
  addBlock: () => void
  moveBlock: (uid: string, delta: -1 | 1) => void
  removeBlock: (uid: string) => void
  updateQuestion: (
    blockUid: string,
    questionUid: string,
    patch: Partial<Pick<EditorQuestion, 'text' | 'guidance'>>
  ) => void
  addQuestion: (blockUid: string) => void
  moveQuestion: (blockUid: string, questionUid: string, delta: -1 | 1) => void
  removeQuestion: (blockUid: string, questionUid: string) => void
  /** El componente marca el foco como aplicado (callback ref, nunca autoFocus). */
  consumeFocus: () => void
  /** Reintenta la carga inicial en modo edición. */
  reload: () => void
  /** Valida y persiste; true si se guardó (la página vuelve al listado). */
  save: () => Promise<boolean>
}

const EMPTY_ERRORS: EditorErrors = { name: null, blockTitles: {}, questionTexts: {} }

function blankQuestion(): EditorQuestion {
  return { uid: crypto.randomUUID(), text: '', guidance: '' }
}

function blankBlock(): EditorBlock {
  return { uid: crypto.randomUUID(), title: '', guidance: '', questions: [blankQuestion()] }
}

function emptyForm(): EditorForm {
  return { name: '', phase: null, blocks: [blankBlock()] }
}

/** Serializa el formulario SIN uids: base de comparación del guard isDirty. */
function serialize(form: EditorForm): string {
  return JSON.stringify({
    name: form.name,
    phase: form.phase,
    blocks: form.blocks.map((block) => ({
      title: block.title,
      guidance: block.guidance,
      questions: block.questions.map(({ text, guidance }) => ({ text, guidance }))
    }))
  })
}

/** Construye el payload de bloques del bridge: pela uids y OMITE guidance vacía. */
function toTemplateBlocks(blocks: EditorBlock[]): TemplateBlock[] {
  return blocks.map((block) => ({
    title: block.title,
    ...(block.guidance.trim() !== '' ? { guidance: block.guidance } : {}),
    questions: block.questions.map((question) => ({
      text: question.text,
      ...(question.guidance.trim() !== '' ? { guidance: question.guidance } : {})
    }))
  }))
}

/**
 * Estado del editor de una plantilla de entrevista (SPEC-012): formulario de
 * dos niveles (bloques → preguntas). `id === null` es el modo nuevo (un bloque
 * inicial con una pregunta en blanco); con id, se hidrata desde
 * `getInterviewTemplate` (guidance `?? ''`). La validación es inline on
 * submit: nombre, títulos de bloque y textos de pregunta requeridos ("Campo
 * requerido"); guías y fase opcionales. La fase viaja SIEMPRE en el payload
 * para poder volver a null ("Sin fase").
 */
export function useInterviewTemplateEditor(id: string | null): UseInterviewTemplateEditorResult {
  const [form, setForm] = useState<EditorForm>(emptyForm)
  const [snapshot, setSnapshot] = useState<string>(() => serialize(form))
  const [loadState, setLoadState] = useState<EditorLoadState>(
    id === null ? { status: 'ready' } : { status: 'loading' }
  )
  const [errors, setErrors] = useState<EditorErrors>(EMPTY_ERRORS)
  const [pendingFocusUid, setPendingFocusUid] = useState<string | null>(null)

  // No marca loading por sí mismo: el estado inicial en modo edición ya lo es,
  // y así el efecto de montaje no hace setState síncrono
  // (react-hooks/set-state-in-effect); los setState viven en el callback de la
  // promesa (patrón useSecrets). Reintentar sí marca loading (reload).
  const load = useCallback((): void => {
    if (id === null) {
      return
    }
    void window.api.db.getInterviewTemplate(id).then((result) => {
      if (!result.ok) {
        setLoadState({ status: 'error', message: result.error.message })
        return
      }
      // Hidratación defensiva: sin bloques → bloque en blanco; bloque sin
      // preguntas → pregunta en blanco (los invariantes del editor exigen ≥1).
      const hydrated: EditorForm = {
        name: result.data.name,
        phase: result.data.phase,
        blocks:
          result.data.blocks.length > 0
            ? result.data.blocks.map((block) => ({
                uid: crypto.randomUUID(),
                title: block.title,
                guidance: block.guidance ?? '',
                questions:
                  block.questions.length > 0
                    ? block.questions.map((question) => ({
                        uid: crypto.randomUUID(),
                        text: question.text,
                        guidance: question.guidance ?? ''
                      }))
                    : [blankQuestion()]
              }))
            : [blankBlock()]
      }
      setForm(hydrated)
      setSnapshot(serialize(hydrated))
      setErrors(EMPTY_ERRORS)
      setLoadState({ status: 'ready' })
    })
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback((): void => {
    setLoadState({ status: 'loading' })
    load()
  }, [load])

  const setName = useCallback((name: string): void => {
    setForm((prev) => ({ ...prev, name }))
    setErrors((prev) => (prev.name === null ? prev : { ...prev, name: null }))
  }, [])

  const setPhase = useCallback((phase: InterviewPhase | null): void => {
    setForm((prev) => ({ ...prev, phase }))
  }, [])

  const updateBlock = useCallback(
    (uid: string, patch: Partial<Pick<EditorBlock, 'title' | 'guidance'>>): void => {
      setForm((prev) => ({
        ...prev,
        blocks: prev.blocks.map((block) => (block.uid === uid ? { ...block, ...patch } : block))
      }))
      if (patch.title !== undefined) {
        setErrors((prev) => {
          if (!(uid in prev.blockTitles)) {
            return prev
          }
          const blockTitles = { ...prev.blockTitles }
          delete blockTitles[uid]
          return { ...prev, blockTitles }
        })
      }
    },
    []
  )

  const addBlock = useCallback((): void => {
    const block = blankBlock()
    setForm((prev) => ({ ...prev, blocks: [...prev.blocks, block] }))
    // El foco va al TÍTULO del bloque recién añadido (el uid es el del bloque).
    setPendingFocusUid(block.uid)
  }, [])

  const moveBlock = useCallback((uid: string, delta: -1 | 1): void => {
    setForm((prev) => {
      const index = prev.blocks.findIndex((block) => block.uid === uid)
      const target = index + delta
      if (index === -1 || target < 0 || target >= prev.blocks.length) {
        return prev
      }
      const blocks = [...prev.blocks]
      const moved = blocks[index]
      blocks[index] = blocks[target]
      blocks[target] = moved
      return { ...prev, blocks }
    })
  }, [])

  // No-op con un único bloque (el botón está deshabilitado, pero el invariante
  // se protege aquí también). Al eliminar, limpia los errores del título del
  // bloque Y de los textos de sus preguntas (mapas planos por uid).
  const removeBlock = useCallback(
    (uid: string): void => {
      if (form.blocks.length <= 1) {
        return
      }
      const removed = form.blocks.find((block) => block.uid === uid)
      if (removed === undefined) {
        return
      }
      setForm((prev) =>
        prev.blocks.length <= 1
          ? prev
          : { ...prev, blocks: prev.blocks.filter((block) => block.uid !== uid) }
      )
      setErrors((prev) => {
        const blockTitles = { ...prev.blockTitles }
        delete blockTitles[uid]
        const questionTexts = { ...prev.questionTexts }
        for (const question of removed.questions) {
          delete questionTexts[question.uid]
        }
        return { ...prev, blockTitles, questionTexts }
      })
    },
    [form.blocks]
  )

  const updateQuestion = useCallback(
    (
      blockUid: string,
      questionUid: string,
      patch: Partial<Pick<EditorQuestion, 'text' | 'guidance'>>
    ): void => {
      setForm((prev) => ({
        ...prev,
        blocks: prev.blocks.map((block) =>
          block.uid === blockUid
            ? {
                ...block,
                questions: block.questions.map((question) =>
                  question.uid === questionUid ? { ...question, ...patch } : question
                )
              }
            : block
        )
      }))
      if (patch.text !== undefined) {
        setErrors((prev) => {
          if (!(questionUid in prev.questionTexts)) {
            return prev
          }
          const questionTexts = { ...prev.questionTexts }
          delete questionTexts[questionUid]
          return { ...prev, questionTexts }
        })
      }
    },
    []
  )

  const addQuestion = useCallback((blockUid: string): void => {
    const question = blankQuestion()
    setForm((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) =>
        block.uid === blockUid ? { ...block, questions: [...block.questions, question] } : block
      )
    }))
    // El foco va al texto de la pregunta recién añadida.
    setPendingFocusUid(question.uid)
  }, [])

  // Movimiento acotado POR NIVEL: los límites son los del bloque contenedor.
  const moveQuestion = useCallback((blockUid: string, questionUid: string, delta: -1 | 1): void => {
    setForm((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) => {
        if (block.uid !== blockUid) {
          return block
        }
        const index = block.questions.findIndex((question) => question.uid === questionUid)
        const target = index + delta
        if (index === -1 || target < 0 || target >= block.questions.length) {
          return block
        }
        const questions = [...block.questions]
        const moved = questions[index]
        questions[index] = questions[target]
        questions[target] = moved
        return { ...block, questions }
      })
    }))
  }, [])

  // No-op si el bloque quedaría sin preguntas: NO limpia el error en ese caso
  // (la pregunta sigue en pantalla y su "Campo requerido" debe permanecer).
  const removeQuestion = useCallback(
    (blockUid: string, questionUid: string): void => {
      const block = form.blocks.find((candidate) => candidate.uid === blockUid)
      if (block === undefined || block.questions.length <= 1) {
        return
      }
      setForm((prev) => ({
        ...prev,
        blocks: prev.blocks.map((candidate) =>
          candidate.uid === blockUid && candidate.questions.length > 1
            ? {
                ...candidate,
                questions: candidate.questions.filter((question) => question.uid !== questionUid)
              }
            : candidate
        )
      }))
      setErrors((prev) => {
        if (!(questionUid in prev.questionTexts)) {
          return prev
        }
        const questionTexts = { ...prev.questionTexts }
        delete questionTexts[questionUid]
        return { ...prev, questionTexts }
      })
    },
    [form.blocks]
  )

  const consumeFocus = useCallback((): void => {
    setPendingFocusUid(null)
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    const nameError = form.name.trim() === '' ? 'Campo requerido' : null
    const blockTitles: Record<string, string> = {}
    const questionTexts: Record<string, string> = {}
    for (const block of form.blocks) {
      if (block.title.trim() === '') {
        blockTitles[block.uid] = 'Campo requerido'
      }
      for (const question of block.questions) {
        if (question.text.trim() === '') {
          questionTexts[question.uid] = 'Campo requerido'
        }
      }
    }
    if (
      nameError !== null ||
      Object.keys(blockTitles).length > 0 ||
      Object.keys(questionTexts).length > 0
    ) {
      setErrors({ name: nameError, blockTitles, questionTexts })
      return false
    }
    setErrors(EMPTY_ERRORS)
    const blocks = toTemplateBlocks(form.blocks)
    // phase viaja SIEMPRE (create y update): es la única forma de volver a null.
    const result =
      id === null
        ? await window.api.db.createInterviewTemplate({
            name: form.name,
            phase: form.phase,
            blocks
          })
        : await window.api.db.updateInterviewTemplate(id, {
            name: form.name,
            phase: form.phase,
            blocks
          })
    if (!result.ok) {
      toast.error(result.error.message)
      return false
    }
    toast(id === null ? 'Plantilla creada' : 'Cambios guardados')
    return true
  }, [form, id])

  const isDirty = useMemo(() => serialize(form) !== snapshot, [form, snapshot])

  return {
    mode: id === null ? 'new' : 'edit',
    loadState,
    form,
    errors,
    isDirty,
    pendingFocusUid,
    setName,
    setPhase,
    updateBlock,
    addBlock,
    moveBlock,
    removeBlock,
    updateQuestion,
    addQuestion,
    moveQuestion,
    removeQuestion,
    consumeFocus,
    reload,
    save
  }
}
