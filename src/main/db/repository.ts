import { randomUUID } from 'crypto'
import type {
  Company,
  Contact,
  CreateCompanyInput,
  CreateContactInput,
  CreateDiscoveryInput,
  CreateInterviewInput,
  CreateInterviewTemplateInput,
  CreateNoteInput,
  CreateNoteTemplateInput,
  Discovery,
  Interview,
  InterviewTemplate,
  Note,
  NoteTemplate,
  UpdateCompanyPatch,
  UpdateContactPatch,
  UpdateDiscoveryPatch,
  UpdateInterviewPatch,
  UpdateInterviewTemplatePatch,
  UpdateNotePatch,
  UpdateNoteTemplatePatch
} from '../../renderer/src/types/domain'
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
      .filter((interview) => companyIds.has(interview.companyId))
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
    assertReference(draft.companies, input.companyId, 'empresa')
    if (input.contactId !== undefined && input.contactId !== null) {
      assertReference(draft.contacts, input.contactId, 'contacto')
    }
    if (input.templateId !== undefined && input.templateId !== null) {
      assertReference(draft.interviewTemplates, input.templateId, 'template de entrevista')
    }
    const now = nowIso()
    const interview: Interview = {
      id: randomUUID(),
      companyId: input.companyId,
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
      assertReference(draft.contacts, patch.contactId, 'contacto')
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
