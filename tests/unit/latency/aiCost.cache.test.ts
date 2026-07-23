// @vitest-environment node
/**
 * SPEC-023 (revisada por la revisión de coste 2026-07): coste con prompt
 * caching — tarifas de caché por MODELO en computeCostUsd (retrocompatible
 * con la llamada sin componentes de caché), plegado de los componentes en el
 * inputTokens del total al registrar (el desglose real vive en byTask), y
 * respeto del estimatedCostUsd ya calculado por componentes en el volcado de
 * la sesión del asistente (camino recording:stop).
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeCostUsd,
  MODEL_RATES,
  recordAssistantSessionUsage,
  recordInterviewUsage
} from '../../../src/main/aiCost'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import type { Interview } from '../../../src/renderer/src/types/domain'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  }
}))

function seedInterview(): Interview {
  const discovery = repository.createDiscovery({ name: 'Vertical Sanidad' })
  return repository.createInterview({ discoveryId: discovery.id, title: 'Captura medida' })
}

beforeEach(() => {
  initStore(mkdtempSync(join(tmpdir(), 'maurya-latency-cost-')))
})

describe('aiCost (prompt caching SPEC-023)', () => {
  // SPEC-023 · AC-07 (tarifas reales de caché: escritura 1,25× y lectura 0,1×)
  it('computes the cost with the four rates and stays compatible with calls without cache components', () => {
    expect(MODEL_RATES['claude-opus-4-8'].cacheWriteUsdPerMtok).toBe(6.25)
    expect(MODEL_RATES['claude-opus-4-8'].cacheReadUsdPerMtok).toBe(0.5)
    // Cada tarifa por separado
    expect(computeCostUsd('claude-opus-4-8', 0, 0, 1_000_000, 0)).toBe(6.25)
    expect(computeCostUsd('claude-opus-4-8', 0, 0, 0, 1_000_000)).toBe(0.5)
    // Combinado: 1000 in ($0.005) + 500 out ($0.0125) + 800 write ($0.005) + 4000 read ($0.002)
    expect(computeCostUsd('claude-opus-4-8', 1000, 500, 800, 4000)).toBeCloseTo(0.0245, 10)
    // Retrocompatibilidad AC-08: sin componentes de caché ≡ defaults a 0
    expect(computeCostUsd('claude-opus-4-8', 1000, 500)).toBe(
      computeCostUsd('claude-opus-4-8', 1000, 500, 0, 0)
    )
    expect(computeCostUsd('claude-opus-4-8', 1000, 500)).toBeCloseTo(0.0175, 10)
  })

  // SPEC-023 · AC-07 (registro: inputTokens del total = suma de los 3
  // componentes; coste ≠ tarificar caché a la tarifa de entrada). Revisión de
  // coste 2026-07: el desglose sin plegar queda en byTask.
  it('folds the cache components into the total inputTokens, keeps the breakdown in byTask, and prices with the four rates', () => {
    const interview = seedInterview()

    recordInterviewUsage(interview.id, 'scriptGeneration', 'claude-opus-4-8', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationInputTokens: 800,
      cacheReadInputTokens: 4000
    })

    const usage = repository.getInterview(interview.id).aiUsage
    // El desglose reportado suma los tres componentes de entrada
    expect(usage).toMatchObject({ calls: 1, inputTokens: 5800, outputTokens: 500 })
    // El coste usa las 4 tarifas…
    expect(usage?.estimatedCostUsd).toBeCloseTo(
      computeCostUsd('claude-opus-4-8', 1000, 500, 800, 4000),
      10
    )
    // …y NO es el resultado de tarificar el total plegado a la tarifa de entrada
    expect(usage?.estimatedCostUsd).not.toBeCloseTo(
      computeCostUsd('claude-opus-4-8', 5800, 500),
      10
    )
    // byTask conserva los componentes SIN plegar (auditoría del hit-rate)
    expect(usage?.byTask?.scriptGeneration).toMatchObject({
      inputTokens: 1000,
      cacheWriteTokens: 800,
      cacheReadTokens: 4000
    })
  })

  // SPEC-023 · AC-08 (sin campos de caché, el total del registro es idéntico
  // al histórico; byTask acompaña con componentes de caché a 0)
  it('keeps the historic totals untouched when the response carries no cache fields', () => {
    const interview = seedInterview()

    recordInterviewUsage(interview.id, 'scriptGeneration', 'claude-opus-4-8', {
      inputTokens: 1000,
      outputTokens: 500
    })

    expect(repository.getInterview(interview.id).aiUsage).toMatchObject({
      calls: 1,
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCostUsd: computeCostUsd('claude-opus-4-8', 1000, 500)
    })
    expect(repository.getInterview(interview.id).aiUsage?.byTask?.scriptGeneration).toMatchObject({
      cacheWriteTokens: 0,
      cacheReadTokens: 0
    })
  })

  // SPEC-023 · AC-07 (desviación declarada: estimatedCostUsd explícito se
  // respeta — recomputar desde el inputTokens ya plegado tarificaría el caché
  // a la tarifa de entrada). Camino del volcado de la sesión del asistente.
  it('respects an explicit estimatedCostUsd computed by components instead of recomputing from folded tokens', () => {
    const interview = seedInterview()
    // Volcado de sesión del asistente: inputTokens YA plegado + coste por componentes
    const sessionCost = computeCostUsd('claude-opus-4-8', 1000, 500, 800, 4000)

    recordAssistantSessionUsage(interview.id, {
      calls: 3,
      inputTokens: 5800,
      outputTokens: 500,
      estimatedCostUsd: sessionCost
    })

    const usage = repository.getInterview(interview.id).aiUsage
    expect(usage).toMatchObject({ calls: 3, inputTokens: 5800, outputTokens: 500 })
    // Coste respetado tal cual (≠ tarificar 5800 planos a la entrada)
    expect(usage?.estimatedCostUsd).toBe(sessionCost)
    expect(usage?.estimatedCostUsd).not.toBeCloseTo(
      computeCostUsd('claude-opus-4-8', 5800, 500),
      10
    )
  })
})
