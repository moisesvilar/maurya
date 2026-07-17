import type { Company, Contact, Interview, Note } from './domain'

/**
 * Tipos del bridge LLM (SPEC-014): generación de guión y objetivos con Claude;
 * ampliado en SPEC-017 con la generación de la nota de resumen.
 * Este módulo NO debe depender del DOM: lo importan (type-only) main y preload.
 * La clave de Anthropic jamás cruza este contrato: solo viaja estado
 * (`hasAnthropicKey`) y resultados tipados.
 */

/**
 * Tope de longitud del guión en caracteres de markdown. Es el MISMO número en
 * toda la cadena: la generación en main trunca a este límite, el editor del
 * guión no deja crecer más allá, y el asistente en vivo (SCRIPT_EXCERPT_CHARS)
 * incluye exactamente este tamaño en su prompt — así nunca existe guión que no
 * quepa entero en el prompt del asistente. Constante runtime (no solo tipo):
 * este módulo sigue sin depender del DOM y main puede importarla con valor.
 */
export const SCRIPT_MAX_CHARS = 6000

export type LlmErrorKind =
  | 'no-key'
  | 'no-template'
  | 'no-transcript'
  /** Generación de contexto: no hay fuente utilizable (web / LinkedIn+MCP). */
  | 'no-source'
  | 'auth'
  | 'rate-limit'
  | 'connection'
  | 'format'

export interface LlmError {
  kind: LlmErrorKind
  message: string
}

/**
 * Envelope de TODA operación de `api.llm` (patrón DbResult de SPEC-006): las
 * promesas del bridge nunca se rechazan; los fallos viajan como
 * `{ ok: false, error }`.
 */
export type LlmResult<T> = { ok: true; data: T } | { ok: false; error: LlmError }

/** Estado consultable por pull (`llm:get-status`): si hay clave resoluble en main. */
export interface LlmStatus {
  hasAnthropicKey: boolean
}

/**
 * Capacidades de la generación de contexto (`llm:get-context-capabilities`):
 * si hay clave de Anthropic resoluble y si el MCP de LinkedIn está
 * configurado (URL en Ajustes). La UI las usa para habilitar los botones
 * "Generar contexto" sin conocer secretos.
 */
export interface ContextCapabilities {
  hasAnthropicKey: boolean
  linkedinMcpConfigured: boolean
}

/**
 * Resultado de la generación de la nota (SPEC-017): la entrevista actualizada
 * (status 'summarized') y la nota creada o sustituida. Ambos se persisten SOLO
 * tras un parseo válido del structured output.
 */
export interface NoteGenerationResult {
  interview: Interview
  note: Note
}

/**
 * Evento push main → renderer de la evaluación automática de objetivos tras la
 * grabación (SPEC-025, canal `llm:objective-evaluation`). La evaluación manual
 * no emite eventos: su resultado viaja en la respuesta del invoke.
 */
export type ObjectiveEvaluationEvent =
  | { interviewId: string; status: 'evaluating' }
  | { interviewId: string; status: 'done'; interview: Interview }
  | { interviewId: string; status: 'error'; error: LlmError }

/**
 * Evento push main → renderer de la autogeneración del guión al crear la
 * captura (SPEC-033, canal `llm:script-generation`). La generación manual no
 * emite eventos: su resultado viaja en la respuesta del invoke. El error viaja
 * como string (`message`, literal de la spec) a diferencia del LlmError de
 * ObjectiveEvaluationEvent — divergencia documentada en el plan.
 */
export type ScriptGenerationEvent =
  | { interviewId: string; status: 'generating' }
  | { interviewId: string; status: 'done'; interview: Interview }
  | { interviewId: string; status: 'error'; message: string }

/** API expuesta por el preload en `window.api.llm`. */
export interface LlmApi {
  getStatus: () => Promise<LlmResult<LlmStatus>>
  /** Capacidades de la generación de contexto (clave + MCP de LinkedIn). */
  getContextCapabilities: () => Promise<LlmResult<ContextCapabilities>>
  /**
   * Genera el contexto de la empresa (scraping de la web y/o LinkedIn vía
   * MCP + resumen con Claude) y lo persiste en `company.context`.
   */
  generateCompanyContext: (companyId: string) => Promise<LlmResult<Company>>
  /**
   * Genera el contexto del contacto desde LinkedIn (solo con MCP configurado
   * y linkedinUrl del contacto) y lo persiste en `contact.context`.
   */
  generateContactContext: (contactId: string) => Promise<LlmResult<Contact>>
  generateScript: (interviewId: string) => Promise<LlmResult<Interview>>
  /** Genera la nota de resumen según el note-template (SPEC-017). */
  generateNote: (
    interviewId: string,
    noteTemplateId: string
  ) => Promise<LlmResult<NoteGenerationResult>>
  /** Evalúa el cumplimiento de los objetivos contra el transcript (SPEC-025). */
  evaluateObjectives: (interviewId: string) => Promise<LlmResult<Interview>>
  /** Marca manual de cumplimiento con reescritura de la explicación (SPEC-028). */
  overrideObjective: (
    interviewId: string,
    objectiveIndex: number,
    met: boolean,
    comment: string
  ) => Promise<LlmResult<Interview>>
  /** Suscripción a la evaluación automática post-grabación (SPEC-025). */
  onObjectiveEvaluation: (callback: (event: ObjectiveEvaluationEvent) => void) => () => void
  /**
   * Disparo fire-and-forget de la autogeneración del guión al crear la captura
   * (SPEC-033): resuelve tras los guards síncronos, nunca espera al LLM.
   */
  autoGenerateScript: (interviewId: string) => Promise<LlmResult<void>>
  /** Suscripción a la autogeneración del guión (SPEC-033). */
  onScriptGeneration: (callback: (event: ScriptGenerationEvent) => void) => () => void
}
