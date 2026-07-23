// @vitest-environment node
/**
 * SPEC-021 (revisada por la revisión de coste 2026-07): medición del coste de
 * IA — módulo puro src/main/aiCost.ts (tarifas POR MODELO, cálculo, redondeo
 * del límite, extracción defensiva del usage y registro best-effort POR TAREA
 * que jamás lanza, con desglose byTask persistido).
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeCostUsd,
  extractUsage,
  MODEL_RATES,
  recordAssistantSessionUsage,
  recordInterviewUsage,
  roundUpUsd
} from '../../../src/main/aiCost'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  }
}))

/** Respuesta mínima del SDK con (o sin) bloque usage, para extractUsage. */
function sdkMessage(usage?: unknown): Anthropic.Message {
  return { usage } as unknown as Anthropic.Message
}

beforeEach(() => {
  initStore(mkdtempSync(join(tmpdir(), 'maurya-aicost-')))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('aiCost', () => {
  // SPEC-021 · refuerzo de AC-01..AC-03, revisado: tarifa POR MODELO
  it('computes the estimated cost with the per-model rates (opus 5/25, sonnet 3/15, haiku 1/5 per MTok)', () => {
    expect(MODEL_RATES['claude-opus-4-8'].inputUsdPerMtok).toBe(5)
    expect(MODEL_RATES['claude-opus-4-8'].outputUsdPerMtok).toBe(25)
    expect(MODEL_RATES['claude-sonnet-5'].inputUsdPerMtok).toBe(3)
    expect(MODEL_RATES['claude-sonnet-5'].outputUsdPerMtok).toBe(15)
    expect(MODEL_RATES['claude-haiku-4-5'].inputUsdPerMtok).toBe(1)
    expect(MODEL_RATES['claude-haiku-4-5'].outputUsdPerMtok).toBe(5)
    expect(computeCostUsd('claude-opus-4-8', 1_000_000, 0)).toBe(5)
    expect(computeCostUsd('claude-opus-4-8', 0, 1_000_000)).toBe(25)
    expect(computeCostUsd('claude-haiku-4-5', 1_000_000, 0)).toBe(1)
    expect(computeCostUsd('claude-haiku-4-5', 0, 1_000_000)).toBe(5)
    // 1000 in + 500 out en opus → 0.005 + 0.0125 = 0.0175
    expect(computeCostUsd('claude-opus-4-8', 1000, 500)).toBeCloseTo(0.0175, 10)
    expect(computeCostUsd('claude-opus-4-8', 0, 0)).toBe(0)
  })

  // SPEC-023, revisado: los componentes de caché tarifican a 1,25×/0,1× la
  // entrada DEL MODELO de la tarea
  it('prices cache writes at 1.25x and cache reads at 0.1x the input rate of each model', () => {
    for (const model of ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-4-8'] as const) {
      const rates = MODEL_RATES[model]
      expect(rates.cacheWriteUsdPerMtok).toBeCloseTo(rates.inputUsdPerMtok * 1.25, 10)
      expect(rates.cacheReadUsdPerMtok).toBeCloseTo(rates.inputUsdPerMtok * 0.1, 10)
      expect(computeCostUsd(model, 0, 0, 1_000_000, 0)).toBeCloseTo(rates.cacheWriteUsdPerMtok, 10)
      expect(computeCostUsd(model, 0, 0, 0, 1_000_000)).toBeCloseTo(rates.cacheReadUsdPerMtok, 10)
    }
  })

  // SPEC-021 · refuerzo de AC-11 (la comparación con el límite pausa ANTES de excederlo)
  it('rounds up to 2 decimals for the limit comparison', () => {
    expect(roundUpUsd(0.001)).toBe(0.01)
    expect(roundUpUsd(1.111)).toBe(1.12)
    expect(roundUpUsd(1.1)).toBe(1.1)
    expect(roundUpUsd(0)).toBe(0)
  })

  // SPEC-021 · AC-16 (extracción defensiva del bloque usage). SPEC-023: la
  // forma gana los dos componentes de caché, defensivos igual que el resto
  // (0 si faltan, no son number o son null — el SDK los tipa `number | null`).
  it('extracts the token usage from the response and degrades to 0 tokens when the usage block is missing or malformed', () => {
    expect(
      extractUsage(
        sdkMessage({
          input_tokens: 1200,
          output_tokens: 340,
          cache_creation_input_tokens: 900,
          cache_read_input_tokens: 4000
        })
      )
    ).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
      cacheCreationInputTokens: 900,
      cacheReadInputTokens: 4000
    })
    // Sin bloque de uso (caso anómalo del SDK) → 0 tokens sin lanzar
    expect(extractUsage(sdkMessage(undefined))).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0
    })
    // Bloque malformado → cada campo degrada por separado; los campos de
    // caché `null` del SDK (respuesta sin caché) degradan a 0 igual que los
    // ausentes
    expect(
      extractUsage(
        sdkMessage({
          input_tokens: 'x',
          output_tokens: 7,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null
        })
      )
    ).toEqual({
      inputTokens: 0,
      outputTokens: 7,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0
    })
  })

  // SPEC-021 · AC-17 (best-effort: el fallo de medición se loguea y JAMÁS
  // lanza) + revisión de coste 2026-07: atribución por tarea con desglose
  it('records the per-task usage delta on the interview and never throws on failure, logging to console instead', () => {
    const discovery = repository.createDiscovery({ name: 'Vertical Sanidad' })
    const interview = repository.createInterview({
      discoveryId: discovery.id,
      title: 'Captura medida'
    })

    // Camino feliz: registra una llamada con su coste calculado según el
    // modelo de la tarea; el total pliega los componentes de caché y el
    // desglose byTask los conserva separados
    recordInterviewUsage(interview.id, 'scriptGeneration', 'claude-opus-4-8', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationInputTokens: 200,
      cacheReadInputTokens: 300
    })
    const usage = repository.getInterview(interview.id).aiUsage
    expect(usage).toEqual({
      calls: 1,
      inputTokens: 1500,
      outputTokens: 500,
      estimatedCostUsd: computeCostUsd('claude-opus-4-8', 1000, 500, 200, 300),
      byTask: {
        scriptGeneration: {
          calls: 1,
          inputTokens: 1000,
          outputTokens: 500,
          cacheWriteTokens: 200,
          cacheReadTokens: 300,
          estimatedCostUsd: computeCostUsd('claude-opus-4-8', 1000, 500, 200, 300)
        }
      }
    })

    // Segunda llamada de OTRA tarea con OTRO modelo: cada tarea acumula por
    // separado con su tarifa; el total suma ambas
    recordInterviewUsage(interview.id, 'noteGeneration', 'claude-haiku-4-5', {
      inputTokens: 100,
      outputTokens: 50
    })
    const after = repository.getInterview(interview.id).aiUsage
    expect(after?.calls).toBe(2)
    expect(after?.byTask?.noteGeneration?.estimatedCostUsd).toBeCloseTo(
      computeCostUsd('claude-haiku-4-5', 100, 50),
      10
    )
    expect(after?.estimatedCostUsd).toBeCloseTo(
      computeCostUsd('claude-opus-4-8', 1000, 500, 200, 300) +
        computeCostUsd('claude-haiku-4-5', 100, 50),
      10
    )

    // Fallo (entrevista inexistente): no lanza, loguea y no escribe nada
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() =>
      recordInterviewUsage('no-existe', 'scriptGeneration', 'claude-opus-4-8', {
        inputTokens: 10,
        outputTokens: 10
      })
    ).not.toThrow()
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(repository.getInterview(interview.id).aiUsage?.calls).toBe(2)
  })

  // Revisión de coste 2026-07: el volcado de una sesión del asistente respeta
  // el coste precalculado por componentes y mergea byTask por tarea
  it('records an assistant session dump preserving its precomputed cost and merging byTask, and never throws on failure', () => {
    const discovery = repository.createDiscovery({ name: 'Vertical Retail' })
    const interview = repository.createInterview({
      discoveryId: discovery.id,
      title: 'Entrevista con sesión'
    })

    recordAssistantSessionUsage(interview.id, {
      calls: 3,
      inputTokens: 3000,
      outputTokens: 900,
      estimatedCostUsd: 0.5,
      byTask: {
        assistantInteractive: {
          calls: 2,
          inputTokens: 1000,
          outputTokens: 600,
          cacheWriteTokens: 500,
          cacheReadTokens: 700,
          estimatedCostUsd: 0.3
        },
        assistantMaintenance: {
          calls: 1,
          inputTokens: 400,
          outputTokens: 300,
          cacheWriteTokens: 100,
          cacheReadTokens: 300,
          estimatedCostUsd: 0.2
        }
      }
    })
    const usage = repository.getInterview(interview.id).aiUsage
    expect(usage?.calls).toBe(3)
    // El coste precalculado por componentes se respeta tal cual (recomputar
    // desde el total plegado tarificaría el caché a la tarifa de entrada)
    expect(usage?.estimatedCostUsd).toBe(0.5)
    expect(usage?.byTask?.assistantInteractive?.cacheReadTokens).toBe(700)
    expect(usage?.byTask?.assistantMaintenance?.calls).toBe(1)

    // Fallo (entrevista inexistente): no lanza, loguea
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() =>
      recordAssistantSessionUsage('no-existe', {
        calls: 1,
        inputTokens: 1,
        outputTokens: 1,
        estimatedCostUsd: 0.01
      })
    ).not.toThrow()
    expect(consoleError).toHaveBeenCalledTimes(1)
  })
})
