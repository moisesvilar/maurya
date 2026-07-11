import { BrowserWindow } from 'electron'
import type { ScriptGenerationEvent } from '../renderer/src/types/llm'
import { generateInterviewScript, getAnthropicKey, toLlmError } from './llmService'
import * as repository from './db/repository'

/**
 * Autogeneración del guión al crear la captura (SPEC-033). Vive SOLO en main
 * (patrón objectiveEvaluationService de SPEC-025): la generación en sí es la
 * de llmService (SPEC-014, con contexto histórico, structured outputs y coste
 * SPEC-021) — este módulo solo añade el disparo con guards silenciosos y los
 * eventos `llm:script-generation`.
 *
 * Invariantes:
 * - Fire-and-forget: `autoGenerateInterviewScript` es síncrona y devuelve
 *   void; la creación de la captura y la navegación nunca esperan al LLM.
 * - Guards SIEMPRE silenciosos (retorno sin acción y sin evento): entrevista
 *   inexistente, sin template, con guión ya presente (el disparo automático
 *   jamás sobrescribe) o sin clave de Anthropic → cero llamadas al LLM.
 * - Los eventos van a TODAS las ventanas: si el usuario navegó fuera, el
 *   guión queda persistido igualmente y se muestra al volver a entrar.
 */

function emitScriptGenerationEvent(event: ScriptGenerationEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('llm:script-generation', event)
    }
  }
}

/**
 * Guard in-flight propio, además del inFlight de llmService: el interno
 * deduplica la llamada al LLM pero re-emitiría los eventos; este Set hace que
 * un disparo automático duplicado sea completamente silencioso.
 */
const autoInFlight = new Set<string>()

/**
 * Dispara la generación automática del guión tras crear la captura
 * (SPEC-033). Fire-and-forget y silenciosa en sus guards; el progreso y el
 * resultado viajan como eventos `llm:script-generation`.
 */
export function autoGenerateInterviewScript(interviewId: string): void {
  if (autoInFlight.has(interviewId)) {
    return
  }
  let interview: ReturnType<typeof repository.getInterview>
  try {
    interview = repository.getInterview(interviewId)
  } catch {
    return
  }
  if (interview.templateId === null) {
    return
  }
  // El guión existente nunca se sobrescribe por el disparo automático:
  // regenerar exige la intención explícita de «Regenerar» (SPEC-014).
  if (interview.scriptMarkdown !== null) {
    return
  }
  if (getAnthropicKey() === null) {
    return
  }
  // Sin guard de límite de coste (decisión de la spec): una captura recién
  // creada tiene aiUsage cero, así que el guard nunca aplicaría.

  autoInFlight.add(interviewId)
  emitScriptGenerationEvent({ interviewId, status: 'generating' })
  generateInterviewScript(interviewId)
    .then((updated) => {
      emitScriptGenerationEvent({ interviewId, status: 'done', interview: updated })
    })
    .catch((error: unknown) => {
      emitScriptGenerationEvent({
        interviewId,
        status: 'error',
        message: toLlmError(error).message
      })
    })
    .finally(() => {
      autoInFlight.delete(interviewId)
    })
}
