import type Anthropic from '@anthropic-ai/sdk'
import type { AiModelId, AiTaskId, AiTaskUsage, AiUsage } from '../renderer/src/types/domain'
import * as repository from './db/repository'

/**
 * Medición del coste de IA por entrevista (SPEC-021, revisada en la revisión
 * de coste 2026-07). Único módulo con las tarifas por modelo y el cálculo del
 * coste estimado; los servicios de main registran aquí el uso de cada llamada
 * exitosa CON su tarea y su modelo, y el desglose de los 4 componentes de
 * tokens queda persistido por tarea (auditable el hit-rate de caché). La
 * medición es best-effort: un fallo suyo JAMÁS rompe una generación ni la
 * parada de una grabación.
 */

/** Tarifa de un modelo en USD por millón de tokens, por componente. */
export interface ModelRates {
  inputUsdPerMtok: number
  outputUsdPerMtok: number
  /** Escritura de caché (TTL 5 min): 1,25× la tarifa de entrada. */
  cacheWriteUsdPerMtok: number
  /** Lectura de caché: 0,1× la tarifa de entrada. */
  cacheReadUsdPerMtok: number
}

/**
 * Tarifas vigentes (USD/MTok), verificadas contra platform.claude.com el
 * 2026-07-23. Deliberadamente no configurables (decisión de SPEC-021): si un
 * precio cambia, se actualiza aquí en una release. Nota Sonnet 5: hasta el
 * 2026-08-31 rige un precio introductorio de 2/10 (caché 2.5/0.2); se tarifica
 * al precio estándar 3/15 — estimación conservadora (nunca infraestima y el
 * gate del límite de coste pausa antes, no después).
 */
export const MODEL_RATES: Record<AiModelId, ModelRates> = {
  'claude-haiku-4-5': {
    inputUsdPerMtok: 1,
    outputUsdPerMtok: 5,
    cacheWriteUsdPerMtok: 1.25,
    cacheReadUsdPerMtok: 0.1
  },
  'claude-sonnet-5': {
    inputUsdPerMtok: 3,
    outputUsdPerMtok: 15,
    cacheWriteUsdPerMtok: 3.75,
    cacheReadUsdPerMtok: 0.3
  },
  'claude-opus-4-8': {
    inputUsdPerMtok: 5,
    outputUsdPerMtok: 25,
    cacheWriteUsdPerMtok: 6.25,
    cacheReadUsdPerMtok: 0.5
  }
}

/**
 * Coste estimado en USD de una llamada o acumulado: tokens × tarifa por MTok
 * del modelo indicado. `inputTokens` son SOLO los tokens de entrada no
 * cacheados; los componentes de caché son opcionales con default 0.
 */
export function computeCostUsd(
  model: AiModelId,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,
  cacheReadTokens = 0
): number {
  const rates = MODEL_RATES[model]
  return (
    (inputTokens / 1e6) * rates.inputUsdPerMtok +
    (outputTokens / 1e6) * rates.outputUsdPerMtok +
    (cacheWriteTokens / 1e6) * rates.cacheWriteUsdPerMtok +
    (cacheReadTokens / 1e6) * rates.cacheReadUsdPerMtok
  )
}

/**
 * Redondeo HACIA ARRIBA a 2 decimales. Usado SOLO en la comparación con el
 * límite configurado: el asistente se pausa antes de excederlo (UX Design).
 * SPEC-021-iter-1: toFixed(6) neutraliza el residuo IEEE-754 de value*100
 * (p. ej. 1.1*100 === 110.00000000000001, ~1e-13) sin absorber terceras
 * decimales reales (≥1e-3) — un importe ya exacto a 2 decimales no cambia.
 */
export function roundUpUsd(value: number): number {
  return Math.ceil(Number((value * 100).toFixed(6))) / 100
}

/**
 * Extrae los tokens del bloque `usage` de una respuesta de Messages.
 * Defensivo (AC): una respuesta sin bloque de uso — caso anómalo del SDK —
 * contabiliza la llamada con 0 tokens sin romper la generación.
 * SPEC-023: incluye los componentes de caché. Ojo: con prompt caching,
 * `usage.input_tokens` del SDK son SOLO los tokens de entrada no cacheados;
 * el total de entrada = input + cacheCreation + cacheRead. Los campos de
 * caché del SDK son `number | null` → el typeof degrada null (y ausente) a 0.
 */
export function extractUsage(response: Anthropic.Message): {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
} {
  const usage = response.usage as
    | {
        input_tokens?: unknown
        output_tokens?: unknown
        cache_creation_input_tokens?: unknown
        cache_read_input_tokens?: unknown
      }
    | undefined
  const asTokens = (value: unknown): number => (typeof value === 'number' ? value : 0)
  return {
    inputTokens: asTokens(usage?.input_tokens),
    outputTokens: asTokens(usage?.output_tokens),
    cacheCreationInputTokens: asTokens(usage?.cache_creation_input_tokens),
    cacheReadInputTokens: asTokens(usage?.cache_read_input_tokens)
  }
}

/** Desglose por tarea de una llamada única (helper de recordInterviewUsage). */
export function buildTaskUsage(
  model: AiModelId,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
  }
): AiTaskUsage {
  const cacheWrite = tokens.cacheCreationInputTokens ?? 0
  const cacheRead = tokens.cacheReadInputTokens ?? 0
  return {
    calls: 1,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cacheWriteTokens: cacheWrite,
    cacheReadTokens: cacheRead,
    estimatedCostUsd: computeCostUsd(
      model,
      tokens.inputTokens,
      tokens.outputTokens,
      cacheWrite,
      cacheRead
    )
  }
}

/**
 * Suma al acumulado `aiUsage` persistido de la entrevista el uso de una
 * llamada exitosa, atribuido a su tarea y tarificado con su modelo. JAMÁS
 * lanza: un fallo de medición se loguea y no interrumpe al usuario (AC).
 * Los componentes de caché se pliegan en `inputTokens` del total (forma
 * histórica de AiUsage para la UI); el desglose real queda en `byTask`.
 */
export function recordInterviewUsage(
  interviewId: string,
  task: AiTaskId,
  model: AiModelId,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
  }
): void {
  try {
    const taskUsage = buildTaskUsage(model, tokens)
    const delta: AiUsage = {
      calls: 1,
      inputTokens: taskUsage.inputTokens + taskUsage.cacheWriteTokens + taskUsage.cacheReadTokens,
      outputTokens: taskUsage.outputTokens,
      estimatedCostUsd: taskUsage.estimatedCostUsd,
      byTask: { [task]: taskUsage }
    }
    repository.addInterviewAiUsage(interviewId, delta)
  } catch (error) {
    console.error('[aiCost] No se pudo registrar el uso de IA de la entrevista:', error)
  }
}

/**
 * Vuelca el registro completo de una SESIÓN del asistente (varias llamadas ya
 * agregadas por tarea) al acumulado de la entrevista. El coste del total viene
 * recomputado por componentes desde `byTask` — recomputar desde el inputTokens
 * plegado tarificaría el caché a la tarifa de entrada normal. JAMÁS lanza.
 */
export function recordAssistantSessionUsage(interviewId: string, usage: AiUsage): void {
  try {
    repository.addInterviewAiUsage(interviewId, usage)
  } catch (error) {
    console.error('[aiCost] No se pudo registrar el uso de IA de la sesión del asistente:', error)
  }
}
