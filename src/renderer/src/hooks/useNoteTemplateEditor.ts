import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { NoteTemplateSection } from '@/types/domain'

/**
 * Sección del editor: extiende la sección persistida con un `uid` de cliente
 * (keys estables en React y foco direccionable). El uid NO se persiste: se
 * pela al construir el input/patch para `api.db`.
 */
export interface EditorSection extends NoteTemplateSection {
  uid: string
}

export interface EditorForm {
  name: string
  context: string
  /** Lista ordenada: el orden visual del editor es el orden persistido. */
  sections: EditorSection[]
}

export interface EditorErrors {
  /** "Campo requerido" bajo el nombre, o null. */
  name: string | null
  /** uid de sección → "Campo requerido" bajo su título. */
  sectionTitles: Record<string, string>
}

/** Estado de la carga inicial en modo edición (en modo nuevo siempre ready). */
export type EditorLoadState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' }

export interface UseNoteTemplateEditorResult {
  mode: 'new' | 'edit'
  loadState: EditorLoadState
  form: EditorForm
  errors: EditorErrors
  /** true si el formulario difiere del snapshot cargado (guard de Volver/Cancelar). */
  isDirty: boolean
  /** uid de la sección recién añadida cuyo título debe recibir el foco. */
  pendingFocusUid: string | null
  setName: (name: string) => void
  setContext: (context: string) => void
  updateSection: (uid: string, patch: Partial<NoteTemplateSection>) => void
  addSection: () => void
  moveSection: (uid: string, delta: -1 | 1) => void
  removeSection: (uid: string) => void
  /** La card marca el foco como aplicado (callback ref del título). */
  consumeFocus: () => void
  /** Reintenta la carga inicial en modo edición. */
  reload: () => void
  /** Valida y persiste; true si se guardó (la página vuelve al listado). */
  save: () => Promise<boolean>
}

const EMPTY_ERRORS: EditorErrors = { name: null, sectionTitles: {} }

function blankSection(): EditorSection {
  return { uid: crypto.randomUUID(), title: '', description: '' }
}

function emptyForm(): EditorForm {
  return { name: '', context: '', sections: [blankSection()] }
}

/** Serializa el formulario SIN uids: base de comparación del guard isDirty. */
function serialize(form: EditorForm): string {
  return JSON.stringify({
    name: form.name,
    context: form.context,
    sections: form.sections.map(({ title, description }) => ({ title, description }))
  })
}

/**
 * Estado del editor de una plantilla de notas (SPEC-008). `id === null` es el
 * modo nuevo (form vacío con una sección inicial en blanco); con id, se hidrata
 * desde `getNoteTemplate`. La validación es inline on submit: nombre y títulos
 * de sección requeridos ("Campo requerido"); contexto y descripciones opcionales.
 */
export function useNoteTemplateEditor(id: string | null): UseNoteTemplateEditorResult {
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
    void window.api.db.getNoteTemplate(id).then((result) => {
      if (!result.ok) {
        setLoadState({ status: 'error', message: result.error.message })
        return
      }
      const hydrated: EditorForm = {
        name: result.data.name,
        context: result.data.context,
        sections:
          result.data.sections.length > 0
            ? result.data.sections.map((section) => ({ ...section, uid: crypto.randomUUID() }))
            : [blankSection()]
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

  const setContext = useCallback((context: string): void => {
    setForm((prev) => ({ ...prev, context }))
  }, [])

  const updateSection = useCallback((uid: string, patch: Partial<NoteTemplateSection>): void => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.uid === uid ? { ...section, ...patch } : section
      )
    }))
    if (patch.title !== undefined) {
      setErrors((prev) => {
        if (!(uid in prev.sectionTitles)) {
          return prev
        }
        const sectionTitles = { ...prev.sectionTitles }
        delete sectionTitles[uid]
        return { ...prev, sectionTitles }
      })
    }
  }, [])

  const addSection = useCallback((): void => {
    const section = blankSection()
    setForm((prev) => ({ ...prev, sections: [...prev.sections, section] }))
    setPendingFocusUid(section.uid)
  }, [])

  const moveSection = useCallback((uid: string, delta: -1 | 1): void => {
    setForm((prev) => {
      const index = prev.sections.findIndex((section) => section.uid === uid)
      const target = index + delta
      if (index === -1 || target < 0 || target >= prev.sections.length) {
        return prev
      }
      const sections = [...prev.sections]
      const moved = sections[index]
      sections[index] = sections[target]
      sections[target] = moved
      return { ...prev, sections }
    })
  }, [])

  const removeSection = useCallback((uid: string): void => {
    setForm((prev) =>
      prev.sections.length <= 1
        ? prev
        : { ...prev, sections: prev.sections.filter((section) => section.uid !== uid) }
    )
    setErrors((prev) => {
      if (!(uid in prev.sectionTitles)) {
        return prev
      }
      const sectionTitles = { ...prev.sectionTitles }
      delete sectionTitles[uid]
      return { ...prev, sectionTitles }
    })
  }, [])

  const consumeFocus = useCallback((): void => {
    setPendingFocusUid(null)
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    const nameError = form.name.trim() === '' ? 'Campo requerido' : null
    const sectionTitles: Record<string, string> = {}
    for (const section of form.sections) {
      if (section.title.trim() === '') {
        sectionTitles[section.uid] = 'Campo requerido'
      }
    }
    if (nameError !== null || Object.keys(sectionTitles).length > 0) {
      setErrors({ name: nameError, sectionTitles })
      return false
    }
    setErrors(EMPTY_ERRORS)
    const sections = form.sections.map(({ title, description }) => ({ title, description }))
    const result =
      id === null
        ? await window.api.db.createNoteTemplate({
            name: form.name,
            context: form.context,
            sections
          })
        : await window.api.db.updateNoteTemplate(id, {
            name: form.name,
            context: form.context,
            sections
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
    setContext,
    updateSection,
    addSection,
    moveSection,
    removeSection,
    consumeFocus,
    reload,
    save
  }
}
