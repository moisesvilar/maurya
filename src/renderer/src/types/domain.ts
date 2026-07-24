/**
 * Tipos compartidos del dominio de Maurya (SPEC-006): entidades persistidas
 * localmente, inputs/patches de las operaciones CRUD, errores tipados y el
 * contrato del bridge `api.db`.
 * Este módulo NO debe depender del DOM: lo importan (type-only) main y preload.
 */

import type { AssignCompanyInput, AssignCompanyResult, CaptureListItem } from './captures'
import type { SearchResults } from './search'

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

export interface Discovery {
  id: string
  name: string
  /**
   * Objetivos del discovery (SPEC-043): texto libre del usuario; null = sin
   * objetivos definidos. La migración v2→v3 lo backfillea a null.
   */
  objectives: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Empresa GLOBAL (SPEC-043): ya no pertenece a un discovery, es reutilizable
 * en las entrevistas de cualquier discovery.
 */
export interface Company {
  id: string
  name: string
  website: string | null
  linkedinUrl: string | null
  /**
   * Contexto de la empresa: texto libre del usuario y/o resumen generado con
   * IA (web + LinkedIn). Opcional y sin bump de schemaVersion (patrón
   * aiUsage): ausente en registros anteriores = sin contexto.
   */
  context?: string | null
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: string
  companyId: string
  name: string
  position: string | null
  linkedinUrl: string | null
  /**
   * Contexto del contacto: texto libre del usuario y/o resumen generado con
   * IA desde LinkedIn. Opcional y sin bump de schemaVersion (patrón aiUsage):
   * ausente en registros anteriores = sin contexto.
   */
  context?: string | null
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

/**
 * Modelos de Claude seleccionables por tarea (revisión de coste 2026-07).
 * Lista cerrada: la tabla de tarifas de aiCost.ts y el mapeo del parámetro
 * thinking de aiModels.ts cubren exactamente estos IDs.
 */
export type AiModelId = 'claude-haiku-4-5' | 'claude-sonnet-5' | 'claude-opus-4-8'

/**
 * Tareas de IA configurables (revisión de coste 2026-07). Cada llamada al LLM
 * de la app pertenece a exactamente una tarea; el modelo y el thinking de cada
 * una se configuran en Ajustes con defaults en aiModels.ts.
 */
export type AiTaskId =
  | 'assistantInteractive'
  | 'assistantMaintenance'
  | 'scriptGeneration'
  | 'noteGeneration'
  | 'objectiveEvaluation'
  | 'companyContext'
  | 'contactContext'

/** Configuración de una tarea de IA: modelo + thinking (si el modelo lo soporta). */
export interface AiTaskConfig {
  model: AiModelId
  thinking: boolean
}

/** Ajustes de modelos por tarea, singleton en db.json (patrón aiCostSettings). */
export type AiTaskSettings = Record<AiTaskId, AiTaskConfig>

/** IDs de modelo válidos, en orden de coste ascendente (Select de Ajustes). */
export const AI_MODEL_IDS: readonly AiModelId[] = [
  'claude-haiku-4-5',
  'claude-sonnet-5',
  'claude-opus-4-8'
]

/** IDs de tarea en el orden de presentación de la UI de Ajustes. */
export const AI_TASK_IDS: readonly AiTaskId[] = [
  'assistantInteractive',
  'assistantMaintenance',
  'scriptGeneration',
  'noteGeneration',
  'objectiveEvaluation',
  'companyContext',
  'contactContext'
]

/** true si el valor es un AiModelId conocido (validación de settings). */
export function isAiModelId(value: unknown): value is AiModelId {
  return typeof value === 'string' && (AI_MODEL_IDS as readonly string[]).includes(value)
}

/**
 * Defaults acordados en la revisión de coste 2026-07: Haiku sin thinking para
 * el juicio interactivo del asistente (sensible a latencia, error barato);
 * Sonnet 5 con thinking para el mantenimiento de cola/objetivos (error
 * irreversible, sin urgencia de latencia); Opus con adaptive para las llamadas
 * únicas de calidad (guión, nota, evaluación, contexto), como hasta ahora.
 */
export const DEFAULT_AI_TASK_SETTINGS: AiTaskSettings = {
  assistantInteractive: { model: 'claude-haiku-4-5', thinking: false },
  assistantMaintenance: { model: 'claude-sonnet-5', thinking: true },
  scriptGeneration: { model: 'claude-opus-4-8', thinking: true },
  noteGeneration: { model: 'claude-opus-4-8', thinking: true },
  objectiveEvaluation: { model: 'claude-opus-4-8', thinking: true },
  companyContext: { model: 'claude-opus-4-8', thinking: true },
  contactContext: { model: 'claude-opus-4-8', thinking: true }
}

/**
 * Desglose de uso de UNA tarea dentro de una entrevista. A diferencia del
 * total plegado de AiUsage, aquí `inputTokens` son SOLO los tokens de entrada
 * no cacheados: los componentes de caché van aparte para poder auditar el
 * hit-rate real y tarificar cada componente con su precio.
 */
export interface AiTaskUsage {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  estimatedCostUsd: number
}

/**
 * Acumulado de uso de IA de una entrevista (SPEC-021): llamadas al LLM,
 * tokens de entrada/salida y coste estimado en USD según la tarifa del modelo.
 * `inputTokens` va plegado (entrada + caché) por retrocompatibilidad con la
 * UI; `byTask` (revisión de coste 2026-07) guarda el desglose por tarea con
 * los 4 componentes de tokens. Registros antiguos no traen `byTask`.
 */
export interface AiUsage {
  calls: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  byTask?: Partial<Record<AiTaskId, AiTaskUsage>>
}

/**
 * Ajustes de coste de IA (SPEC-021), singleton en db.json. `limitUsd` es el
 * límite de gasto estimado por entrevista para el asistente en vivo; null =
 * sin límite (el guión y la nota nunca se bloquean).
 */
export interface AiCostSettings {
  limitUsd: number | null
}

/**
 * Ajustes del asistente en vivo (SPEC-036), singleton en db.json (patrón
 * aiCostSettings). `queueSize` es el máximo de preguntas pendientes visibles
 * a la vez en la cola del asistente: entero 1–5, default 3.
 */
export interface AssistantSettings {
  queueSize: number
}

/**
 * Ajustes del MCP de LinkedIn (p. ej. Apify), singleton en db.json (patrón
 * aiCostSettings). `url` es el endpoint HTTP del servidor MCP; null = MCP no
 * configurado (el enriquecimiento desde LinkedIn queda inerte). El token de
 * autorización NO vive aquí: va cifrado en secrets.json (kind 'linkedinMcp').
 */
export interface LinkedinMcpSettings {
  url: string | null
}

/**
 * Evaluación de cumplimiento de UN objetivo (SPEC-025), generada por el LLM
 * tras la grabación. `reason` es el motivo corto (≤50 palabras) de por qué el
 * objetivo se cumplió o no.
 */
export interface ObjectiveResult {
  met: boolean
  reason: string
}

/**
 * Marca manual de cumplimiento de UN objetivo (SPEC-028). `comment` es el
 * literal del humano; `text` la explicación reescrita por el LLM (o el
 * comentario literal si no hay clave de Anthropic).
 */
export interface ObjectiveOverride {
  met: boolean
  comment: string
  text: string
}

/**
 * Desenlace manual de una pregunta del asistente persistido en la entrevista
 * (SPEC-039). `reason` es el motivo del descarte que el entrevistador deja al
 * finalizar (opcional; solo aplica a 'discarded').
 */
export interface InterviewQuestionOutcome {
  question: string
  outcome: 'discarded' | 'answered'
  reason?: string | null
}

/**
 * Grupo de entrevistas dentro de un discovery (SPEC-043): agrupa entrevistas
 * con un objetivo y templates por defecto opcionales (ambos SET NULL si el
 * template referenciado se elimina). Cae en cascada con su discovery; sus
 * entrevistas sobreviven con `interviewGroupId` null al borrar el grupo.
 */
export interface InterviewGroup {
  id: string
  discoveryId: string
  name: string
  objective: string | null
  interviewTemplateId: string | null
  noteTemplateId: string | null
  createdAt: string
  updatedAt: string
}

export interface Interview {
  id: string
  /**
   * Discovery al que pertenece la captura (SPEC-020): obligatorio y ancla de
   * la cascada. La empresa deja de ser prerequisito de la entrevista.
   */
  discoveryId: string
  /**
   * Empresa asignada; null en capturas sin empresa (SPEC-020). SPEC-043: las
   * empresas son globales — ya NO rige la invariante «empresa ∈ discovery»
   * (derogada de SPEC-020); vale cualquier empresa del sistema.
   */
  companyId: string | null
  /**
   * Contactos de la entrevista (SPEC-043), en el orden dado por el caller:
   * ⊆ contactos de `companyId`, sin duplicados; no vacío ⇒ `companyId` ≠ null
   * (invariantes del repositorio).
   */
  contactIds: string[]
  /**
   * Grupo de entrevistas asignado (SPEC-043); null = sin grupo. Si no es
   * null, el grupo existe y pertenece al MISMO discovery (invariante del
   * repositorio). SET NULL al borrar el grupo.
   */
  interviewGroupId: string | null
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
  /**
   * Acumulado de uso de IA (SPEC-021). Opcional y sin bump de schemaVersion:
   * ausente = sin datos de coste (entrevistas anteriores a la spec). Solo lo
   * escribe main vía `addInterviewAiUsage`; nunca es escribible por patch.
   */
  aiUsage?: AiUsage | null
  /**
   * Evaluación post-grabación de los objetivos (SPEC-025), alineada por índice
   * con `objectives`. Opcional y sin bump de schemaVersion (patrón aiUsage):
   * ausente = sin evaluación. Solo la escribe main vía
   * `setInterviewObjectiveResults`; nunca es escribible por patch, y cualquier
   * cambio en `objectives` la descarta (invariante del repositorio).
   */
  objectiveResults?: ObjectiveResult[] | null
  /**
   * Marcas manuales de cumplimiento (SPEC-028), alineadas por índice con
   * `objectives` (entrada `null` = objetivo sin marca manual). Opcional y sin
   * bump de schemaVersion (patrón aiUsage/objectiveResults): ausente = sin
   * marcas. Solo lo escribe main vía `setInterviewObjectiveOverride`; nunca es
   * escribible por patch, y cualquier cambio en `objectives` lo descarta
   * (invariante del repositorio).
   */
  objectiveOverrides?: Array<ObjectiveOverride | null> | null
  /**
   * Preguntas descartadas/respondidas manualmente en la sesión del asistente
   * (SPEC-039), descartadas primero. Opcional y sin bump de schemaVersion
   * (patrón aiUsage/objectiveResults): ausente = sin acciones manuales. Solo
   * lo escribe main (recording:stop y el guardado de motivos); nunca es
   * escribible por patch.
   */
  questionOutcomes?: InterviewQuestionOutcome[] | null
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
// Prompts de IA personalizables (SPEC-026)
// ---------------------------------------------------------------------------

/** Catálogo fijo de prompts personalizables; el orden es el del listado en Ajustes. */
export const CUSTOM_PROMPT_IDS = ['script', 'note', 'assistant'] as const

/** 'script' = guión y objetivos · 'note' = nota de resumen · 'assistant' = asistente en vivo. */
export type CustomPromptId = (typeof CUSTOM_PROMPT_IDS)[number]

/**
 * Override persistido en db.json (SPEC-026). Solo cubre el bloque de
 * persona/enfoque del system prompt; las reglas estructurales viven bloqueadas
 * en main. `body` es Markdown plano: la fuente de verdad de lo que se envía.
 * Los prompts NO son secretos: nunca van a secrets.json.
 */
export interface CustomPromptOverride {
  id: CustomPromptId
  body: string
  updatedAt: string
}

/** Vista compuesta que consume Ajustes: default + reglas fijas + override vigente. */
export interface CustomPrompt {
  id: CustomPromptId
  /** Texto por defecto del bloque persona/enfoque (módulo de defaults de main). */
  defaultBody: string
  /** Partes bloqueadas del system prompt, en solo lectura para la UI. */
  lockedRules: string
  /** Texto personalizado del usuario; null = se usa el default. */
  overrideBody: string | null
  /** Timestamp del override; null si no hay. */
  updatedAt: string | null
}

// ---------------------------------------------------------------------------
// Inputs y patches de las operaciones CRUD
// ---------------------------------------------------------------------------

export interface CreateDiscoveryInput {
  name: string
  objectives?: string | null
}

export interface UpdateDiscoveryPatch {
  name?: string
  objectives?: string | null
}

export interface CreateCompanyInput {
  name: string
  website?: string | null
  linkedinUrl?: string | null
  context?: string | null
}

export interface UpdateCompanyPatch {
  name?: string
  website?: string | null
  linkedinUrl?: string | null
  context?: string | null
}

export interface CreateContactInput {
  companyId: string
  name: string
  position?: string | null
  linkedinUrl?: string | null
  context?: string | null
}

export interface UpdateContactPatch {
  name?: string
  position?: string | null
  linkedinUrl?: string | null
  context?: string | null
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

export interface CreateInterviewGroupInput {
  discoveryId: string
  name: string
  objective?: string | null
  interviewTemplateId?: string | null
  noteTemplateId?: string | null
}

export interface UpdateInterviewGroupPatch {
  name?: string
  objective?: string | null
  interviewTemplateId?: string | null
  noteTemplateId?: string | null
}

export interface CreateInterviewInput {
  /** Discovery obligatorio (SPEC-020): ancla mínima de toda captura. */
  discoveryId: string
  /** Empresa opcional (SPEC-020): omitida o null en el flujo capture-first. */
  companyId?: string | null
  title: string
  /** Contactos de la empresa (SPEC-043); ausente → []. */
  contactIds?: string[]
  /** Grupo del discovery (SPEC-043); ausente → null. */
  interviewGroupId?: string | null
  templateId?: string | null
}

export interface UpdateInterviewPatch {
  title?: string
  status?: InterviewStatus
  contactIds?: string[]
  /** Grupo destino; debe pertenecer al MISMO discovery de la entrevista. */
  interviewGroupId?: string | null
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
  /** Todas las empresas del sistema (SPEC-043: globales, sin filtro por discovery). */
  listCompanies: () => Promise<DbResult<Company[]>>
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

  /** Grupos de entrevistas por discovery (SPEC-043). */
  createInterviewGroup: (input: CreateInterviewGroupInput) => Promise<DbResult<InterviewGroup>>
  listInterviewGroups: (discoveryId: string) => Promise<DbResult<InterviewGroup[]>>
  getInterviewGroup: (id: string) => Promise<DbResult<InterviewGroup>>
  updateInterviewGroup: (
    id: string,
    patch: UpdateInterviewGroupPatch
  ) => Promise<DbResult<InterviewGroup>>
  deleteInterviewGroup: (id: string) => Promise<DbResult<null>>

  createInterview: (input: CreateInterviewInput) => Promise<DbResult<Interview>>
  listInterviews: (companyId: string) => Promise<DbResult<Interview[]>>
  getInterview: (id: string) => Promise<DbResult<Interview>>
  updateInterview: (id: string, patch: UpdateInterviewPatch) => Promise<DbResult<Interview>>
  deleteInterview: (id: string) => Promise<DbResult<null>>
  /** Listado global de capturas (SPEC-020): contexto resuelto, updatedAt desc. */
  listAllInterviews: () => Promise<DbResult<CaptureListItem[]>>
  /**
   * Motivos de las preguntas descartadas (SPEC-039): índices contra el array
   * `questionOutcomes` completo; solo rellena `reason` de entradas
   * 'discarded', ignora índices inválidos. Mutación atómica única.
   */
  setInterviewDiscardReasons: (
    interviewId: string,
    reasons: Array<{ index: number; reason: string }>
  ) => Promise<DbResult<Interview>>
  /** Asignación diferida de empresa/contacto (SPEC-020): mutación compuesta atómica. */
  assignInterviewCompany: (
    interviewId: string,
    input: AssignCompanyInput
  ) => Promise<DbResult<AssignCompanyResult>>

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

  /** Ajustes de coste de IA (SPEC-021): límite por entrevista del asistente. */
  getAiCostSettings: () => Promise<DbResult<AiCostSettings>>
  setAiCostSettings: (settings: AiCostSettings) => Promise<DbResult<AiCostSettings>>

  /** Ajustes del asistente en vivo (SPEC-036): tamaño de la cola de preguntas. */
  getAssistantSettings: () => Promise<DbResult<AssistantSettings>>
  setAssistantSettings: (settings: AssistantSettings) => Promise<DbResult<AssistantSettings>>

  /** Ajustes de modelos por tarea de IA (revisión de coste 2026-07). */
  getAiTaskSettings: () => Promise<DbResult<AiTaskSettings>>
  setAiTaskSettings: (settings: AiTaskSettings) => Promise<DbResult<AiTaskSettings>>

  /** Ajustes del MCP de LinkedIn: URL del servidor (el token va por api.secrets). */
  getLinkedinMcpSettings: () => Promise<DbResult<LinkedinMcpSettings>>
  setLinkedinMcpSettings: (settings: LinkedinMcpSettings) => Promise<DbResult<LinkedinMcpSettings>>

  /** Prompts de IA personalizables (SPEC-026): catálogo fijo con override→default. */
  listCustomPrompts: () => Promise<DbResult<CustomPrompt[]>>
  saveCustomPrompt: (id: CustomPromptId, body: string) => Promise<DbResult<CustomPrompt>>
  resetCustomPrompt: (id: CustomPromptId) => Promise<DbResult<CustomPrompt>>
}
