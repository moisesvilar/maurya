import type Anthropic from '@anthropic-ai/sdk'
import type { AiUsage } from '../renderer/src/types/domain'
import * as repository from './db/repository'

/**
 * Medición del coste de IA por entrevista (SPEC-021). Único módulo con la
 * tarifa del modelo y el cálculo del coste estimado; los tres servicios de
 * main (llmService, noteService, assistantService) registran aquí el uso de
 * cada llamada exitosa. La medición es best-effort: un fallo suyo JAMÁS rompe
 * una generación ni la parada de una grabación.
 */

// Tarifa vigente de `claude-opus-4-8` (USD por millón de tokens). Constantes
// deliberadamente no configurables (decisión de la spec): si el precio cambia,
// se actualiza aquí en una release.
export const INPUT_USD_PER_MTOK = 5
export const OUTPUT_USD_PER_MTOK = 25
// Prompt caching (SPEC-023): escritura de caché a 1,25× la tarifa de entrada;
// lectura a 0,1×. Solo el asistente cachea (guión/nota son llamadas únicas).
export const CACHE_WRITE_USD_PER_MTOK = 6.25
export const CACHE_READ_USD_PER_MTOK = 0.5

/**
 * Coste estimado en USD de una llamada o acumulado: tokens × tarifa por MTok.
 * `inputTokens` son SOLO los tokens de entrada no cacheados; los componentes
 * de caché (SPEC-023) son opcionales con default 0 — toda llamada de 2
 * argumentos produce el valor idéntico al histórico (retrocompatible).
 */
export function computeCostUsd(
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,
  cacheReadTokens = 0
): number {
  return (
    (inputTokens / 1e6) * INPUT_USD_PER_MTOK +
    (outputTokens / 1e6) * OUTPUT_USD_PER_MTOK +
    (cacheWriteTokens / 1e6) * CACHE_WRITE_USD_PER_MTOK +
    (cacheReadTokens / 1e6) * CACHE_READ_USD_PER_MTOK
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

/**
 * Suma al acumulado `aiUsage` persistido de la entrevista el uso de una llamada
 * exitosa (o de una sesión completa del asistente si `calls` viene informado).
 * JAMÁS lanza: un fallo de medición se loguea y no interrumpe al usuario (AC).
 * SPEC-023: los componentes de caché se pliegan en `inputTokens` (suma de los
 * tres) sin cambiar la forma de AiUsage; el coste usa las 4 tarifas. Si el
 * caller aporta `estimatedCostUsd` ya calculado por componentes (el volcado de
 * la sesión del asistente pasa su AiUsage, cuyo inputTokens ya viene plegado),
 * se respeta — recomputarlo desde el total plegado tarificaría el caché a la
 * tarifa de entrada normal y falsearía el importe.
 */
export function recordInterviewUsage(
  interviewId: string,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
    calls?: number
    estimatedCostUsd?: number
  }
): void {
  try {
    const cacheWrite = tokens.cacheCreationInputTokens ?? 0
    const cacheRead = tokens.cacheReadInputTokens ?? 0
    const delta: AiUsage = {
      calls: tokens.calls ?? 1,
      inputTokens: tokens.inputTokens + cacheWrite + cacheRead,
      outputTokens: tokens.outputTokens,
      estimatedCostUsd:
        tokens.estimatedCostUsd ??
        computeCostUsd(tokens.inputTokens, tokens.outputTokens, cacheWrite, cacheRead)
    }
    repository.addInterviewAiUsage(interviewId, delta)
  } catch (error) {
    console.error('[aiCost] No se pudo registrar el uso de IA de la entrevista:', error)
  }
}
