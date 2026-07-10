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

/** Coste estimado en USD de una llamada o acumulado: tokens × tarifa por MTok. */
export function computeCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * INPUT_USD_PER_MTOK + (outputTokens / 1e6) * OUTPUT_USD_PER_MTOK
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
 */
export function extractUsage(response: Anthropic.Message): {
  inputTokens: number
  outputTokens: number
} {
  const usage = response.usage as { input_tokens?: unknown; output_tokens?: unknown } | undefined
  return {
    inputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
    outputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0
  }
}

/**
 * Suma al acumulado `aiUsage` persistido de la entrevista el uso de una llamada
 * exitosa (o de una sesión completa del asistente si `calls` viene informado).
 * JAMÁS lanza: un fallo de medición se loguea y no interrumpe al usuario (AC).
 */
export function recordInterviewUsage(
  interviewId: string,
  tokens: { inputTokens: number; outputTokens: number; calls?: number }
): void {
  try {
    const delta: AiUsage = {
      calls: tokens.calls ?? 1,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      estimatedCostUsd: computeCostUsd(tokens.inputTokens, tokens.outputTokens)
    }
    repository.addInterviewAiUsage(interviewId, delta)
  } catch (error) {
    console.error('[aiCost] No se pudo registrar el uso de IA de la entrevista:', error)
  }
}
