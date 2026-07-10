import type { Interview, Note } from './domain'

/**
 * Tipos del bridge LLM (SPEC-014): generación de guión y objetivos con Claude;
 * ampliado en SPEC-017 con la generación de la nota de resumen.
 * Este módulo NO debe depender del DOM: lo importan (type-only) main y preload.
 * La clave de Anthropic jamás cruza este contrato: solo viaja estado
 * (`hasAnthropicKey`) y resultados tipados.
 */

export type LlmErrorKind =
  'no-key' | 'no-template' | 'no-transcript' | 'auth' | 'rate-limit' | 'connection' | 'format'

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

/** API expuesta por el preload en `window.api.llm`. */
export interface LlmApi {
  getStatus: () => Promise<LlmResult<LlmStatus>>
  generateScript: (interviewId: string) => Promise<LlmResult<Interview>>
  /** Genera la nota de resumen según el note-template (SPEC-017). */
  generateNote: (
    interviewId: string,
    noteTemplateId: string
  ) => Promise<LlmResult<NoteGenerationResult>>
  /** Evalúa el cumplimiento de los objetivos contra el transcript (SPEC-025). */
  evaluateObjectives: (interviewId: string) => Promise<LlmResult<Interview>>
  /** Suscripción a la evaluación automática post-grabación (SPEC-025). */
  onObjectiveEvaluation: (callback: (event: ObjectiveEvaluationEvent) => void) => () => void
}
