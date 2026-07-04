/**
 * Tipos compartidos del dominio de Maurya (SPEC-006): entidades persistidas
 * localmente, inputs/patches de las operaciones CRUD, errores tipados y el
 * contrato del bridge `api.db`.
 * Este módulo NO debe depender del DOM: lo importan (type-only) main y preload.
 */

import type { SearchResults } from './search'

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

export interface Discovery {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Company {
  id: string
  discoveryId: string
  name: string
  website: string | null
  linkedinUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: string
  companyId: string
  name: string
  position: string | null
  linkedinUrl: string | null
  createdAt: string
  updatedAt: string
}

/** Fase del discovery a la que apunta un template de entrevista. */
export type InterviewPhase = 'exploratory' | 'problem' | 'solution'

export interface TemplateQuestion {
  text: string
  guidance?: string
}

export interface TemplateBlock {
  title: string
  guidance?: string
  /** Lista ordenada: el orden de inserción es el orden canónico. */
  questions: TemplateQuestion[]
}

export interface InterviewTemplate {
  id: string
  name: string
  phase: InterviewPhase | null
  /** Lista ordenada de bloques; cada bloque conserva el orden de sus preguntas. */
  blocks: TemplateBlock[]
  createdAt: string
  updatedAt: string
}

export type InterviewStatus = 'draft' | 'prepared' | 'recorded' | 'summarized'

export interface Interview {
  id: string
  companyId: string
  contactId: string | null
  templateId: string | null
  title: string
  status: InterviewStatus
  /** Guión generado (H3). */
  scriptMarkdown: string | null
  /** Objetivos de la entrevista (H3). */
  objectives: string[]
  /** Vinculación con la grabación del spike (H4). */
  wavPath: string | null
  /** Vinculación con el transcript del spike (H4). */
  transcriptPath: string | null
  createdAt: string
  updatedAt: string
}

export interface NoteTemplateSection {
  title: string
  description: string
}

export interface NoteTemplate {
  id: string
  name: string
  context: string
  /** Lista ordenada de secciones. */
  sections: NoteTemplateSection[]
  createdAt: string
  updatedAt: string
}

export interface Note {
  id: string
  /** FK a Interview; única por entrevista (0..1). */
  interviewId: string
  contentMarkdown: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Inputs y patches de las operaciones CRUD
// ---------------------------------------------------------------------------

export interface CreateDiscoveryInput {
  name: string
}

export interface UpdateDiscoveryPatch {
  name?: string
}

export interface CreateCompanyInput {
  discoveryId: string
  name: string
  website?: string | null
  linkedinUrl?: string | null
}

export interface UpdateCompanyPatch {
  name?: string
  website?: string | null
  linkedinUrl?: string | null
}

export interface CreateContactInput {
  companyId: string
  name: string
  position?: string | null
  linkedinUrl?: string | null
}

export interface UpdateContactPatch {
  name?: string
  position?: string | null
  linkedinUrl?: string | null
}

export interface CreateInterviewTemplateInput {
  name: string
  phase?: InterviewPhase | null
  blocks?: TemplateBlock[]
}

export interface UpdateInterviewTemplatePatch {
  name?: string
  phase?: InterviewPhase | null
  blocks?: TemplateBlock[]
}

export interface CreateInterviewInput {
  companyId: string
  title: string
  contactId?: string | null
  templateId?: string | null
}

export interface UpdateInterviewPatch {
  title?: string
  status?: InterviewStatus
  contactId?: string | null
  templateId?: string | null
  scriptMarkdown?: string | null
  objectives?: string[]
  wavPath?: string | null
  transcriptPath?: string | null
}

export interface CreateNoteTemplateInput {
  name: string
  context?: string
  sections?: NoteTemplateSection[]
}

export interface UpdateNoteTemplatePatch {
  name?: string
  context?: string
  sections?: NoteTemplateSection[]
}

export interface CreateNoteInput {
  interviewId: string
  contentMarkdown?: string
}

export interface UpdateNotePatch {
  contentMarkdown?: string
}

// ---------------------------------------------------------------------------
// Errores tipados y envelope de resultados
// ---------------------------------------------------------------------------

export type DbErrorKind = 'validation' | 'not-found' | 'reference' | 'storage'

export interface DbError {
  kind: DbErrorKind
  message: string
}

/**
 * Envelope de TODA operación de `api.db`: las promesas del bridge nunca se
 * rechazan (Electron pierde el `kind` al serializar rejections); los fallos
 * viajan como `{ ok: false, error }`.
 */
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: DbError }

/** Estado de la capa de persistencia, consultable por pull (`db:get-status`). */
export interface DbStatus {
  ready: boolean
  /** Error de inicialización (p. ej. archivo corrupto recuperado); null si todo fue bien. */
  initError: DbError | null
}

// ---------------------------------------------------------------------------
// Contrato del bridge api.db
// ---------------------------------------------------------------------------

/**
 * API plana de persistencia expuesta por el preload en `window.api.db`.
 * Desviación documentada respecto a la nota `api.db.<entidad>.<operación>` de
 * la spec: métodos planos (`createCompany` en vez de `company.create`) para
 * mantener trivial el objeto pasado por contextBridge (decisión del plan §3).
 */
export interface DbApi {
  getStatus: () => Promise<DbResult<DbStatus>>

  createDiscovery: (input: CreateDiscoveryInput) => Promise<DbResult<Discovery>>
  listDiscoveries: () => Promise<DbResult<Discovery[]>>
  getDiscovery: (id: string) => Promise<DbResult<Discovery>>
  updateDiscovery: (id: string, patch: UpdateDiscoveryPatch) => Promise<DbResult<Discovery>>
  deleteDiscovery: (id: string) => Promise<DbResult<null>>

  createCompany: (input: CreateCompanyInput) => Promise<DbResult<Company>>
  listCompanies: (discoveryId: string) => Promise<DbResult<Company[]>>
  getCompany: (id: string) => Promise<DbResult<Company>>
  updateCompany: (id: string, patch: UpdateCompanyPatch) => Promise<DbResult<Company>>
  deleteCompany: (id: string) => Promise<DbResult<null>>

  createContact: (input: CreateContactInput) => Promise<DbResult<Contact>>
  listContacts: (companyId: string) => Promise<DbResult<Contact[]>>
  getContact: (id: string) => Promise<DbResult<Contact>>
  updateContact: (id: string, patch: UpdateContactPatch) => Promise<DbResult<Contact>>
  deleteContact: (id: string) => Promise<DbResult<null>>

  createInterviewTemplate: (
    input: CreateInterviewTemplateInput
  ) => Promise<DbResult<InterviewTemplate>>
  listInterviewTemplates: () => Promise<DbResult<InterviewTemplate[]>>
  getInterviewTemplate: (id: string) => Promise<DbResult<InterviewTemplate>>
  updateInterviewTemplate: (
    id: string,
    patch: UpdateInterviewTemplatePatch
  ) => Promise<DbResult<InterviewTemplate>>
  deleteInterviewTemplate: (id: string) => Promise<DbResult<null>>

  createInterview: (input: CreateInterviewInput) => Promise<DbResult<Interview>>
  listInterviews: (companyId: string) => Promise<DbResult<Interview[]>>
  getInterview: (id: string) => Promise<DbResult<Interview>>
  updateInterview: (id: string, patch: UpdateInterviewPatch) => Promise<DbResult<Interview>>
  deleteInterview: (id: string) => Promise<DbResult<null>>

  createNoteTemplate: (input: CreateNoteTemplateInput) => Promise<DbResult<NoteTemplate>>
  listNoteTemplates: () => Promise<DbResult<NoteTemplate[]>>
  getNoteTemplate: (id: string) => Promise<DbResult<NoteTemplate>>
  updateNoteTemplate: (
    id: string,
    patch: UpdateNoteTemplatePatch
  ) => Promise<DbResult<NoteTemplate>>
  deleteNoteTemplate: (id: string) => Promise<DbResult<null>>

  createNote: (input: CreateNoteInput) => Promise<DbResult<Note>>
  getNoteByInterview: (interviewId: string) => Promise<DbResult<Note | null>>
  updateNote: (id: string, patch: UpdateNotePatch) => Promise<DbResult<Note>>
  deleteNote: (id: string) => Promise<DbResult<null>>

  /** Búsqueda global por nombre/título (SPEC-018): resultados agrupados por tipo. */
  search: (query: string) => Promise<DbResult<SearchResults>>
}
