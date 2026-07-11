import { randomUUID } from 'crypto'
import type {
  AiCostSettings,
  AiUsage,
  Company,
  Contact,
  CreateCompanyInput,
  CreateContactInput,
  CreateDiscoveryInput,
  CreateInterviewInput,
  CreateInterviewTemplateInput,
  CreateNoteInput,
  CreateNoteTemplateInput,
  CustomPromptId,
  CustomPromptOverride,
  Discovery,
  Interview,
  InterviewTemplate,
  Note,
  NoteTemplate,
  ObjectiveOverride,
  ObjectiveResult,
  UpdateCompanyPatch,
  UpdateContactPatch,
  UpdateDiscoveryPatch,
  UpdateInterviewPatch,
  UpdateInterviewTemplatePatch,
  UpdateNotePatch,
  UpdateNoteTemplatePatch
} from '../../renderer/src/types/domain'
import { CUSTOM_PROMPT_IDS } from '../../renderer/src/types/domain'
import type {
  AssignCompanyInput,
  AssignCompanyResult,
  CaptureListItem
} from '../../renderer/src/types/captures'
import { notFoundError, referenceError, validationError } from './errors'
import { mutate, read, type DbData } from './store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Timestamp de actualización estrictamente posterior al anterior: si dos
 * updates caen en el mismo milisegundo, se avanza 1 ms para que `updatedAt`
 * cambie siempre (AC de actualización).
 */
function touched(previous: string): string {
  const now = nowIso()
  if (now > previous) {
    return now
  }
  return new Date(Date.parse(previous) + 1).toISOString()
}

/** Valida nombre requerido (vacío o solo espacios = validation) sin alterar el valor persistido. */
function assertName(name: string, entity: string): void {
  if (typeof name !== 'string' || name.trim() === '') {
    throw validationError(`El nombre de ${entity} es obligatorio y no puede estar vacío`)
  }
}

function findOrThrow<T extends { id: string }>(items: T[], id: string, entity: string): T {
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) {
    throw notFoundError(`No existe ${entity} con id ${id}`)
  }
  return item
}

function assertReference<T extends { id: string }>(items: T[], id: string, entity: string): void {
  if (!items.some((candidate) => candidate.id === id)) {
    throw referenceError(`La referencia a ${entity} con id ${id} no existe`)
  }
}

/** Cascada: borra las entrevistas indicadas y sus notas asociadas. */
function deleteInterviewsCascade(draft: DbData, interviewIds: Set<string>): void {
  draft.notes = draft.notes.filter((note) => !interviewIds.has(note.interviewId))
  draft.interviews = draft.interviews.filter((interview) => !interviewIds.has(interview.id))
}

/** Cascada: borra las empresas indicadas con sus contactos, entrevistas y notas. */
function deleteCompaniesCascade(draft: DbData, companyIds: Set<string>): void {
  draft.contacts = draft.contacts.filter((contact) => !companyIds.has(contact.companyId))
  const interviewIds = new Set(
    draft.interviews
      .filter((interview) => interview.companyId !== null && companyIds.has(interview.companyId))
      .map((interview) => interview.id)
  )
  deleteInterviewsCascade(draft, interviewIds)
  draft.companies = draft.companies.filter((company) => !companyIds.has(company.id))
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export function createDiscovery(input: CreateDiscoveryInput): Discovery {
  assertName(input.name, 'discovery')
  return mutate((draft) => {
    const now = nowIso()
    const discovery: Discovery = {
      id: randomUUID(),
      name: input.name,
      createdAt: now,
      updatedAt: now
    }
    draft.discoveries.push(discovery)
    return discovery
  })
}

export function listDiscoveries(): Discovery[] {
  return read((store) => store.discoveries)
}

export function getDiscovery(id: string): Discovery {
  return read((store) => findOrThrow(store.discoveries, id, 'discovery'))
}

export function updateDiscovery(id: string, patch: UpdateDiscoveryPatch): Discovery {
  if (patch.name !== undefined) {
    assertName(patch.name, 'discovery')
  }
  return mutate((draft) => {
    const discovery = findOrThrow(draft.discoveries, id, 'discovery')
    if (patch.name !== undefined) {
      discovery.name = patch.name
    }
    discovery.updatedAt = touched(discovery.updatedAt)
    return discovery
  })
}

export function deleteDiscovery(id: string): null {
  return mutate((draft) => {
    findOrThrow(draft.discoveries, id, 'discovery')
    // SPEC-020: las capturas del discovery (con o sin empresa) caen en cascada;
    // las de empresa caerían igual por deleteCompaniesCascade, pero borrarlas
    // por discoveryId cubre también las que aún no tienen empresa asignada.
    const interviewIds = new Set(
      draft.interviews
        .filter((interview) => interview.discoveryId === id)
        .map((interview) => interview.id)
    )
    deleteInterviewsCascade(draft, interviewIds)
    const companyIds = new Set(
      draft.companies.filter((company) => company.discoveryId === id).map((company) => company.id)
    )
    deleteCompaniesCascade(draft, companyIds)
    draft.discoveries = draft.discoveries.filter((discovery) => discovery.id !== id)
    return null
  })
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

export function createCompany(input: CreateCompanyInput): Company {
  assertName(input.name, 'empresa')
  return mutate((draft) => {
    assertReference(draft.discoveries, input.discoveryId, 'discovery')
    const now = nowIso()
    const company: Company = {
      id: randomUUID(),
      discoveryId: input.discoveryId,
      name: input.name,
      website: input.website ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      createdAt: now,
      updatedAt: now
    }
    draft.companies.push(company)
    return company
  })
}

export function listCompanies(discoveryId: string): Company[] {
  return read((store) => store.companies.filter((company) => company.discoveryId === discoveryId))
}

export function getCompany(id: string): Company {
  return read((store) => findOrThrow(store.companies, id, 'empresa'))
}

export function updateCompany(id: string, patch: UpdateCompanyPatch): Company {
  if (patch.name !== undefined) {
    assertName(patch.name, 'empresa')
  }
  return mutate((draft) => {
    const company = findOrThrow(draft.companies, id, 'empresa')
    if (patch.name !== undefined) {
      company.name = patch.name
    }
    if (patch.website !== undefined) {
      company.website = patch.website
    }
    if (patch.linkedinUrl !== undefined) {
      company.linkedinUrl = patch.linkedinUrl
    }
    company.updatedAt = touched(company.updatedAt)
    return company
  })
}

export function deleteCompany(id: string): null {
  return mutate((draft) => {
    findOrThrow(draft.companies, id, 'empresa')
    deleteCompaniesCascade(draft, new Set([id]))
    return null
  })
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export function createContact(input: CreateContactInput): Contact {
  assertName(input.name, 'contacto')
  return mutate((draft) => {
    assertReference(draft.companies, input.companyId, 'empresa')
    const now = nowIso()
    const contact: Contact = {
      id: randomUUID(),
      companyId: input.companyId,
      name: input.name,
      position: input.position ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      createdAt: now,
      updatedAt: now
    }
    draft.contacts.push(contact)
    return contact
  })
}

export function listContacts(companyId: string): Contact[] {
  return read((store) => store.contacts.filter((contact) => contact.companyId === companyId))
}

export function getContact(id: string): Contact {
  return read((store) => findOrThrow(store.contacts, id, 'contacto'))
}

export function updateContact(id: string, patch: UpdateContactPatch): Contact {
  if (patch.name !== undefined) {
    assertName(patch.name, 'contacto')
  }
  return mutate((draft) => {
    const contact = findOrThrow(draft.contacts, id, 'contacto')
    if (patch.name !== undefined) {
      contact.name = patch.name
    }
    if (patch.position !== undefined) {
      contact.position = patch.position
    }
    if (patch.linkedinUrl !== undefined) {
      contact.linkedinUrl = patch.linkedinUrl
    }
    contact.updatedAt = touched(contact.updatedAt)
    return contact
  })
}

/** Borra el contacto; las entrevistas que lo referencian sobreviven con contactId a null. */
export function deleteContact(id: string): null {
  return mutate((draft) => {
    findOrThrow(draft.contacts, id, 'contacto')
    for (const interview of draft.interviews) {
      if (interview.contactId === id) {
        interview.contactId = null
      }
    }
    draft.contacts = draft.contacts.filter((contact) => contact.id !== id)
    return null
  })
}

// ---------------------------------------------------------------------------
// InterviewTemplate
// ---------------------------------------------------------------------------

export function createInterviewTemplate(input: CreateInterviewTemplateInput): InterviewTemplate {
  assertName(input.name, 'template de entrevista')
  return mutate((draft) => {
    const now = nowIso()
    const template: InterviewTemplate = {
      id: randomUUID(),
      name: input.name,
      phase: input.phase ?? null,
      blocks: input.blocks ?? [],
      createdAt: now,
      updatedAt: now
    }
    draft.interviewTemplates.push(template)
    return template
  })
}

export function listInterviewTemplates(): InterviewTemplate[] {
  return read((store) => store.interviewTemplates)
}

export function getInterviewTemplate(id: string): InterviewTemplate {
  return read((store) => findOrThrow(store.interviewTemplates, id, 'template de entrevista'))
}

export function updateInterviewTemplate(
  id: string,
  patch: UpdateInterviewTemplatePatch
): InterviewTemplate {
  if (patch.name !== undefined) {
    assertName(patch.name, 'template de entrevista')
  }
  return mutate((draft) => {
    const template = findOrThrow(draft.interviewTemplates, id, 'template de entrevista')
    if (patch.name !== undefined) {
      template.name = patch.name
    }
    if (patch.phase !== undefined) {
      template.phase = patch.phase
    }
    if (patch.blocks !== undefined) {
      template.blocks = patch.blocks
    }
    template.updatedAt = touched(template.updatedAt)
    return template
  })
}

/** Borra el template; las entrevistas que lo referencian sobreviven con templateId a null (SET NULL). */
export function deleteInterviewTemplate(id: string): null {
  return mutate((draft) => {
    findOrThrow(draft.interviewTemplates, id, 'template de entrevista')
    for (const interview of draft.interviews) {
      if (interview.templateId === id) {
        interview.templateId = null
      }
    }
    draft.interviewTemplates = draft.interviewTemplates.filter((template) => template.id !== id)
    return null
  })
}

// ---------------------------------------------------------------------------
// Interview
// ---------------------------------------------------------------------------

export function createInterview(input: CreateInterviewInput): Interview {
  assertName(input.title, 'entrevista (título)')
  return mutate((draft) => {
    assertReference(draft.discoveries, input.discoveryId, 'discovery')
    const companyId = input.companyId ?? null
    if (companyId !== null) {
      const company = findOrThrow(draft.companies, companyId, 'empresa')
      // Invariante SPEC-020: la empresa asignada debe pertenecer al discovery.
      if (company.discoveryId !== input.discoveryId) {
        throw referenceError('La empresa no pertenece al discovery indicado')
      }
    }
    if (input.contactId !== undefined && input.contactId !== null) {
      // Invariante SPEC-020: contacto exige empresa y debe pertenecer a ella.
      if (companyId === null) {
        throw referenceError('No se puede asignar un contacto sin empresa')
      }
      const contact = findOrThrow(draft.contacts, input.contactId, 'contacto')
      if (contact.companyId !== companyId) {
        throw referenceError('El contacto no pertenece a la empresa indicada')
      }
    }
    if (input.templateId !== undefined && input.templateId !== null) {
      assertReference(draft.interviewTemplates, input.templateId, 'template de entrevista')
    }
    const now = nowIso()
    const interview: Interview = {
      id: randomUUID(),
      discoveryId: input.discoveryId,
      companyId,
      contactId: input.contactId ?? null,
      templateId: input.templateId ?? null,
      title: input.title,
      status: 'draft',
      scriptMarkdown: null,
      objectives: [],
      wavPath: null,
      transcriptPath: null,
      createdAt: now,
      updatedAt: now
    }
    draft.interviews.push(interview)
    return interview
  })
}

export function listInterviews(companyId: string): Interview[] {
  return read((store) => store.interviews.filter((interview) => interview.companyId === companyId))
}

export function getInterview(id: string): Interview {
  return read((store) => findOrThrow(store.interviews, id, 'entrevista'))
}

export function updateInterview(id: string, patch: UpdateInterviewPatch): Interview {
  if (patch.title !== undefined) {
    assertName(patch.title, 'entrevista (título)')
  }
  return mutate((draft) => {
    const interview = findOrThrow(draft.interviews, id, 'entrevista')
    if (patch.contactId !== undefined && patch.contactId !== null) {
      // Invariante SPEC-020: contacto exige empresa y debe pertenecer a ella
      // (la asignación de empresa va SOLO por assignInterviewCompany).
      if (interview.companyId === null) {
        throw referenceError('No se puede asignar un contacto a una captura sin empresa')
      }
      const contact = findOrThrow(draft.contacts, patch.contactId, 'contacto')
      if (contact.companyId !== interview.companyId) {
        throw referenceError('El contacto no pertenece a la empresa de la entrevista')
      }
    }
    if (patch.templateId !== undefined && patch.templateId !== null) {
      assertReference(draft.interviewTemplates, patch.templateId, 'template de entrevista')
    }
    if (patch.title !== undefined) {
      interview.title = patch.title
    }
    if (patch.status !== undefined) {
      interview.status = patch.status
    }
    if (patch.contactId !== undefined) {
      interview.contactId = patch.contactId
    }
    if (patch.templateId !== undefined) {
      interview.templateId = patch.templateId
    }
    if (patch.scriptMarkdown !== undefined) {
      interview.scriptMarkdown = patch.scriptMarkdown
    }
    if (patch.objectives !== undefined) {
      // Invariante SPEC-025 (extendida por SPEC-028): cualquier cambio en la
      // lista de objetivos (texto, orden, altas o bajas) invalida la
      // evaluación persistida Y las marcas manuales — ambas están alineadas
      // por índice y dejarían de corresponder.
      const changed =
        patch.objectives.length !== interview.objectives.length ||
        patch.objectives.some((objective, index) => objective !== interview.objectives[index])
      if (changed && interview.objectiveResults != null) {
        interview.objectiveResults = null
      }
      // Condición independiente de la anterior: puede haber marcas manuales
      // sin evaluación persistida (SPEC-028, "Marcado sin evaluación previa").
      if (changed && interview.objectiveOverrides != null) {
        interview.objectiveOverrides = null
      }
      interview.objectives = patch.objectives
    }
    if (patch.wavPath !== undefined) {
      interview.wavPath = patch.wavPath
    }
    if (patch.transcriptPath !== undefined) {
      interview.transcriptPath = patch.transcriptPath
    }
    interview.updatedAt = touched(interview.updatedAt)
    return interview
  })
}

/**
 * Listado global de capturas (SPEC-020): TODAS las entrevistas, con los
 * nombres de sus referencias resueltos con Maps O(1) en un único read y en
 * orden `updatedAt` desc. Referencias no resueltas → null (defensivo: un dato
 * inconsistente nunca rompe el listado).
 */
export function listAllInterviews(): CaptureListItem[] {
  return read((store) => {
    const discoveryNames = new Map(store.discoveries.map((item) => [item.id, item.name]))
    const companyNames = new Map(store.companies.map((item) => [item.id, item.name]))
    const contactNames = new Map(store.contacts.map((item) => [item.id, item.name]))
    const templateNames = new Map(store.interviewTemplates.map((item) => [item.id, item.name]))
    return [...store.interviews]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((interview): CaptureListItem => ({
        interview,
        discoveryName: discoveryNames.get(interview.discoveryId) ?? '',
        companyName:
          interview.companyId !== null ? (companyNames.get(interview.companyId) ?? null) : null,
        contactName:
          interview.contactId !== null ? (contactNames.get(interview.contactId) ?? null) : null,
        templateName:
          interview.templateId !== null ? (templateNames.get(interview.templateId) ?? null) : null
      }))
  })
}

/**
 * Asignación diferida de empresa y contacto (SPEC-020): resuelve-o-crea la
 * empresa (nueva → en el discovery de la captura) y el contacto (nuevo → en
 * esa empresa) y actualiza la entrevista, todo en UN SOLO mutate — atómico por
 * diseño del store: si cualquier validación lanza, cero escrituras ("sin
 * estado a medias" del AC).
 */
export function assignInterviewCompany(
  interviewId: string,
  input: AssignCompanyInput
): AssignCompanyResult {
  // Validaciones de forma (antes de tocar el draft, aunque mutate ya lo aísla)
  if ((input.companyId !== undefined) === (input.newCompany !== undefined)) {
    throw validationError('Indica una empresa existente o una empresa nueva (exactamente una)')
  }
  if (input.contactId !== undefined && input.contactId !== null && input.newContact !== undefined) {
    throw validationError('Indica un contacto existente o un contacto nuevo, no ambos')
  }
  if (input.newCompany !== undefined) {
    assertName(input.newCompany.name, 'empresa')
  }
  if (input.newContact !== undefined) {
    assertName(input.newContact.name, 'contacto')
  }
  return mutate((draft) => {
    const interview = findOrThrow(draft.interviews, interviewId, 'entrevista')
    const now = nowIso()

    let company: Company
    if (input.newCompany !== undefined) {
      assertReference(draft.discoveries, interview.discoveryId, 'discovery')
      company = {
        id: randomUUID(),
        discoveryId: interview.discoveryId,
        name: input.newCompany.name,
        website: input.newCompany.website ?? null,
        linkedinUrl: input.newCompany.linkedinUrl ?? null,
        createdAt: now,
        updatedAt: now
      }
      draft.companies.push(company)
    } else {
      company = findOrThrow(draft.companies, input.companyId ?? '', 'empresa')
      // Invariante SPEC-020: la empresa debe pertenecer al discovery de la captura.
      if (company.discoveryId !== interview.discoveryId) {
        throw referenceError('La empresa no pertenece al discovery de la captura')
      }
    }

    let contact: Contact | null = null
    if (input.newContact !== undefined) {
      contact = {
        id: randomUUID(),
        companyId: company.id,
        name: input.newContact.name,
        position: input.newContact.position ?? null,
        linkedinUrl: input.newContact.linkedinUrl ?? null,
        createdAt: now,
        updatedAt: now
      }
      draft.contacts.push(contact)
    } else if (input.contactId !== undefined && input.contactId !== null) {
      contact = findOrThrow(draft.contacts, input.contactId, 'contacto')
      // Invariante SPEC-020: el contacto debe pertenecer a la empresa elegida.
      if (contact.companyId !== company.id) {
        throw referenceError('El contacto no pertenece a la empresa elegida')
      }
    }

    interview.companyId = company.id
    interview.contactId = contact !== null ? contact.id : null
    interview.updatedAt = touched(interview.updatedAt)
    return { interview, company, contact }
  })
}

/** Borra la entrevista y, en cascada, su nota (0..1). */
export function deleteInterview(id: string): null {
  return mutate((draft) => {
    findOrThrow(draft.interviews, id, 'entrevista')
    deleteInterviewsCascade(draft, new Set([id]))
    return null
  })
}

// ---------------------------------------------------------------------------
// NoteTemplate
// ---------------------------------------------------------------------------

export function createNoteTemplate(input: CreateNoteTemplateInput): NoteTemplate {
  assertName(input.name, 'note-template')
  return mutate((draft) => {
    const now = nowIso()
    const template: NoteTemplate = {
      id: randomUUID(),
      name: input.name,
      context: input.context ?? '',
      sections: input.sections ?? [],
      createdAt: now,
      updatedAt: now
    }
    draft.noteTemplates.push(template)
    return template
  })
}

export function listNoteTemplates(): NoteTemplate[] {
  return read((store) => store.noteTemplates)
}

export function getNoteTemplate(id: string): NoteTemplate {
  return read((store) => findOrThrow(store.noteTemplates, id, 'note-template'))
}

export function updateNoteTemplate(id: string, patch: UpdateNoteTemplatePatch): NoteTemplate {
  if (patch.name !== undefined) {
    assertName(patch.name, 'note-template')
  }
  return mutate((draft) => {
    const template = findOrThrow(draft.noteTemplates, id, 'note-template')
    if (patch.name !== undefined) {
      template.name = patch.name
    }
    if (patch.context !== undefined) {
      template.context = patch.context
    }
    if (patch.sections !== undefined) {
      template.sections = patch.sections
    }
    template.updatedAt = touched(template.updatedAt)
    return template
  })
}

export function deleteNoteTemplate(id: string): null {
  return mutate((draft) => {
    findOrThrow(draft.noteTemplates, id, 'note-template')
    draft.noteTemplates = draft.noteTemplates.filter((template) => template.id !== id)
    return null
  })
}

// ---------------------------------------------------------------------------
// CustomPromptOverride (SPEC-026)
// ---------------------------------------------------------------------------

/** El catálogo es fijo: cualquier id fuera de él es un dato inválido del bridge. */
function assertCustomPromptId(id: string): void {
  if (!CUSTOM_PROMPT_IDS.includes(id as CustomPromptId)) {
    throw validationError(`No existe un prompt personalizable con id ${id}`)
  }
}

export function listCustomPromptOverrides(): CustomPromptOverride[] {
  return read((store) => store.customPrompts ?? [])
}

export function getCustomPromptOverride(id: CustomPromptId): CustomPromptOverride | null {
  return read((store) => (store.customPrompts ?? []).find((override) => override.id === id) ?? null)
}

export function saveCustomPromptOverride(id: CustomPromptId, body: string): CustomPromptOverride {
  assertCustomPromptId(id)
  if (typeof body !== 'string' || body.trim() === '') {
    throw validationError('El prompt no puede quedar vacío')
  }
  return mutate((draft) => {
    const overrides = draft.customPrompts ?? []
    const existing = overrides.find((override) => override.id === id)
    if (existing !== undefined) {
      existing.body = body
      existing.updatedAt = touched(existing.updatedAt)
      draft.customPrompts = overrides
      return existing
    }
    const override: CustomPromptOverride = { id, body, updatedAt: nowIso() }
    draft.customPrompts = [...overrides, override]
    return override
  })
}

/** Idempotente: restablecer un prompt ya en default es un no-op correcto. */
export function resetCustomPromptOverride(id: CustomPromptId): null {
  assertCustomPromptId(id)
  return mutate((draft) => {
    draft.customPrompts = (draft.customPrompts ?? []).filter((override) => override.id !== id)
    return null
  })
}

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

export function createNote(input: CreateNoteInput): Note {
  return mutate((draft) => {
    assertReference(draft.interviews, input.interviewId, 'entrevista')
    if (draft.notes.some((note) => note.interviewId === input.interviewId)) {
      throw validationError('La entrevista ya tiene una nota (única por entrevista)')
    }
    const now = nowIso()
    const note: Note = {
      id: randomUUID(),
      interviewId: input.interviewId,
      contentMarkdown: input.contentMarkdown ?? '',
      createdAt: now,
      updatedAt: now
    }
    draft.notes.push(note)
    return note
  })
}

/** Nota de una entrevista (0..1): null si aún no existe (no es un error). */
export function getNoteByInterview(interviewId: string): Note | null {
  return read((store) => store.notes.find((note) => note.interviewId === interviewId) ?? null)
}

export function updateNote(id: string, patch: UpdateNotePatch): Note {
  return mutate((draft) => {
    const note = findOrThrow(draft.notes, id, 'nota')
    if (patch.contentMarkdown !== undefined) {
      note.contentMarkdown = patch.contentMarkdown
    }
    note.updatedAt = touched(note.updatedAt)
    return note
  })
}

export function deleteNote(id: string): null {
  return mutate((draft) => {
    findOrThrow(draft.notes, id, 'nota')
    draft.notes = draft.notes.filter((note) => note.id !== id)
    return null
  })
}

// ---------------------------------------------------------------------------
// Coste de IA (SPEC-021)
// ---------------------------------------------------------------------------

/**
 * Ajustes de coste de IA con normalización defensiva (AC: un ajuste corrupto o
 * ilegible se comporta como "sin límite" sin crashear): si el singleton no es
 * un objeto o `limitUsd` no es null ni un número finito > 0 → { limitUsd: null }.
 */
export function getAiCostSettings(): AiCostSettings {
  return read((store) => {
    const raw: unknown = store.aiCostSettings
    if (typeof raw !== 'object' || raw === null) {
      return { limitUsd: null }
    }
    const limitUsd = (raw as Record<string, unknown>).limitUsd
    if (
      limitUsd === null ||
      (typeof limitUsd === 'number' && Number.isFinite(limitUsd) && limitUsd > 0)
    ) {
      return { limitUsd }
    }
    return { limitUsd: null }
  })
}

export function setAiCostSettings(settings: AiCostSettings): AiCostSettings {
  const limitUsd = settings.limitUsd
  if (limitUsd !== null && (!Number.isFinite(limitUsd) || limitUsd <= 0)) {
    throw validationError('Introduce un importe positivo o deja el campo vacío')
  }
  return mutate((draft) => {
    draft.aiCostSettings = { limitUsd }
    return { limitUsd }
  })
}

/**
 * Suma un delta al acumulado `aiUsage` de la entrevista (SPEC-021). NO toca
 * `updatedAt`: la medición no es una edición del usuario y no debe reordenar
 * el listado de capturas. No se expone por IPC — solo lo usa main vía
 * `recordInterviewUsage` (el renderer jamás puede escribir el acumulado).
 */
/**
 * Persiste la evaluación post-grabación de los objetivos (SPEC-025), alineada
 * por índice con `objectives` (el servicio valida la longitud ANTES de llamar
 * aquí; un desalineamiento es error de programación y se rechaza). NO toca
 * `updatedAt` (patrón addInterviewAiUsage: no es una edición del usuario). No
 * se expone por IPC como escritura de patch — solo lo usa main desde el
 * servicio de evaluación.
 */
export function setInterviewObjectiveResults(id: string, results: ObjectiveResult[]): Interview {
  return mutate((draft) => {
    const interview = findOrThrow(draft.interviews, id, 'entrevista')
    if (results.length !== interview.objectives.length) {
      throw validationError('La evaluación no se corresponde con los objetivos de la entrevista')
    }
    interview.objectiveResults = results
    return interview
  })
}

/**
 * Persiste la marca manual de cumplimiento de UN objetivo (SPEC-028). NO toca
 * `updatedAt` (patrón setInterviewObjectiveResults/addInterviewAiUsage: no
 * reordena el listado de capturas). No se expone por IPC como escritura de
 * patch — solo lo usa main desde el servicio de reescritura. El array se
 * rebasea siempre a la longitud vigente de `objectives` (defensivo: queda
 * alineado por índice aunque el dato previo estuviera desalineado).
 */
export function setInterviewObjectiveOverride(
  id: string,
  index: number,
  override: ObjectiveOverride
): Interview {
  return mutate((draft) => {
    const interview = findOrThrow(draft.interviews, id, 'entrevista')
    if (!Number.isInteger(index) || index < 0 || index >= interview.objectives.length) {
      throw validationError('El objetivo indicado no existe en la entrevista')
    }
    // Rebase defensivo: el array siempre queda alineado en longitud con objectives
    const overrides = Array.from(
      { length: interview.objectives.length },
      (_, i) => interview.objectiveOverrides?.[i] ?? null
    )
    overrides[index] = override
    interview.objectiveOverrides = overrides
    return interview
  })
}

export function addInterviewAiUsage(id: string, delta: AiUsage): Interview {
  return mutate((draft) => {
    const interview = findOrThrow(draft.interviews, id, 'entrevista')
    const base: AiUsage = interview.aiUsage ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0
    }
    interview.aiUsage = {
      calls: base.calls + delta.calls,
      inputTokens: base.inputTokens + delta.inputTokens,
      outputTokens: base.outputTokens + delta.outputTokens,
      estimatedCostUsd: base.estimatedCostUsd + delta.estimatedCostUsd
    }
    return interview
  })
}
