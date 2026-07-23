import type Anthropic from '@anthropic-ai/sdk'
import type { AiModelId, AiTaskConfig, AiTaskId } from '../renderer/src/types/domain'
import { DEFAULT_AI_TASK_SETTINGS } from '../renderer/src/types/domain'
import * as repository from './db/repository'

/**
 * Helpers de main para la configuración de modelos por tarea (revisión de
 * coste 2026-07). Único módulo que sabe mapear (modelo, thinking on/off) a los
 * parámetros válidos de la API: la semántica del parámetro `thinking` difiere
 * por modelo y una combinación inválida devuelve 400.
 *
 * Semántica por modelo (documentación de la API, verificada 2026-07-23):
 * - claude-opus-4-8: `{type:'adaptive'}` activa; OMITIR el parámetro desactiva
 *   (`{type:'disabled'}` también se acepta, pero omitir es equivalente).
 * - claude-sonnet-5: omitir = adaptive ACTIVADO (default del modelo); apagar
 *   requiere `{type:'disabled'}` explícito.
 * - claude-haiku-4-5: no soporta `adaptive`; activar requiere
 *   `{type:'enabled', budget_tokens}` (mínimo 1024, siempre < max_tokens);
 *   omitir desactiva.
 * Ningún modelo de la lista acepta temperature/top_p/top_k; `effort` solo lo
 * soportan Opus 4.8 y Sonnet 5 (400 en Haiku 4.5).
 */

/**
 * Configuración efectiva de una tarea, leída del almacén con try/catch
 * obligatorio (patrón readLimitUsd): un store ilegible o sin dato devuelve el
 * default de la tarea — ninguna generación se bloquea por los ajustes.
 */
export function resolveTaskConfig(task: AiTaskId): AiTaskConfig {
  try {
    return repository.getAiTaskSettings()[task]
  } catch {
    return DEFAULT_AI_TASK_SETTINGS[task]
  }
}

/** Presupuesto de thinking para Haiku (único modelo con budget explícito). */
const HAIKU_THINKING_BUDGET_TOKENS = 2048
/** Mínimo del budget_tokens que exige la API. */
const MIN_THINKING_BUDGET_TOKENS = 1024

/**
 * Parámetro `thinking` correcto para (modelo, on/off), como objeto para hacer
 * spread en la request. `{}` significa "omitir el parámetro" — que en Opus 4.8
 * y Haiku 4.5 desactiva el thinking y en Sonnet 5 lo deja en adaptive (por eso
 * Sonnet 5 apagado necesita `disabled` explícito). `maxTokens` acota el budget
 * de Haiku (la API exige budget_tokens < max_tokens).
 */
export function thinkingParamFor(
  model: AiModelId,
  thinking: boolean,
  maxTokens: number
): { thinking?: Anthropic.ThinkingConfigParam } {
  if (model === 'claude-haiku-4-5') {
    if (!thinking) {
      return {}
    }
    const budget = Math.max(
      MIN_THINKING_BUDGET_TOKENS,
      Math.min(HAIKU_THINKING_BUDGET_TOKENS, maxTokens - MIN_THINKING_BUDGET_TOKENS)
    )
    return { thinking: { type: 'enabled', budget_tokens: budget } }
  }
  if (thinking) {
    return { thinking: { type: 'adaptive' } }
  }
  return model === 'claude-sonnet-5' ? { thinking: { type: 'disabled' } } : {}
}

/**
 * true si el modelo acepta `output_config.effort` (Haiku 4.5 devuelve 400).
 * Las tareas del asistente lo usan para conservar su `effort: 'low'` histórico
 * cuando el humano configure un modelo que lo soporte.
 */
export function supportsEffort(model: AiModelId): boolean {
  return model !== 'claude-haiku-4-5'
}
