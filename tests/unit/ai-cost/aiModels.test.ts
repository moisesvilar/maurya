// @vitest-environment node
/**
 * Revisión de coste 2026-07: helpers de configuración de modelos por tarea
 * (src/main/aiModels.ts) — mapeo del parámetro thinking por modelo (una
 * combinación inválida devuelve 400 en la API), soporte de effort y
 * resolución de la configuración efectiva con degradación a defaults.
 */
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTaskConfig, supportsEffort, thinkingParamFor } from '../../../src/main/aiModels'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import { DEFAULT_AI_TASK_SETTINGS } from '../../../src/renderer/src/types/domain'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  }
}))

let baseDir = ''

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'maurya-aimodels-'))
  initStore(baseDir)
})

describe('aiModels', () => {
  // Semántica del parámetro thinking por modelo (verificada 2026-07-23):
  // Opus 4.8 omite=off/adaptive=on; Sonnet 5 omite=ON → off exige 'disabled';
  // Haiku 4.5 no soporta adaptive → 'enabled' + budget_tokens < max_tokens.
  it('maps (model, thinking) to the exact API parameter each model accepts', () => {
    expect(thinkingParamFor('claude-opus-4-8', true, 4096)).toEqual({
      thinking: { type: 'adaptive' }
    })
    expect(thinkingParamFor('claude-opus-4-8', false, 4096)).toEqual({})

    expect(thinkingParamFor('claude-sonnet-5', true, 4096)).toEqual({
      thinking: { type: 'adaptive' }
    })
    // Sonnet 5 apagado necesita 'disabled' EXPLÍCITO (omitido = adaptive)
    expect(thinkingParamFor('claude-sonnet-5', false, 4096)).toEqual({
      thinking: { type: 'disabled' }
    })

    expect(thinkingParamFor('claude-haiku-4-5', false, 4096)).toEqual({})
    expect(thinkingParamFor('claude-haiku-4-5', true, 4096)).toEqual({
      thinking: { type: 'enabled', budget_tokens: 2048 }
    })
  })

  it('keeps the Haiku thinking budget within [1024, max_tokens) for small windows', () => {
    // max_tokens 2048 → budget acotado a 1024 (mínimo de la API, < max_tokens)
    expect(thinkingParamFor('claude-haiku-4-5', true, 2048)).toEqual({
      thinking: { type: 'enabled', budget_tokens: 1024 }
    })
    // max_tokens grande → budget fijo de 2048
    expect(thinkingParamFor('claude-haiku-4-5', true, 16000)).toEqual({
      thinking: { type: 'enabled', budget_tokens: 2048 }
    })
  })

  // Haiku 4.5 devuelve 400 ante output_config.effort; Opus/Sonnet lo aceptan
  it('reports effort support for every model except Haiku', () => {
    expect(supportsEffort('claude-opus-4-8')).toBe(true)
    expect(supportsEffort('claude-sonnet-5')).toBe(true)
    expect(supportsEffort('claude-haiku-4-5')).toBe(false)
  })

  it('resolves the persisted per-task config and degrades to the task default on an unreadable store', () => {
    // Sin dato persistido: defaults acordados en la revisión de coste
    expect(resolveTaskConfig('assistantInteractive')).toEqual({
      model: 'claude-haiku-4-5',
      thinking: false
    })
    expect(resolveTaskConfig('assistantMaintenance')).toEqual({
      model: 'claude-sonnet-5',
      thinking: true
    })
    expect(resolveTaskConfig('scriptGeneration')).toEqual({
      model: 'claude-opus-4-8',
      thinking: true
    })

    // Con override persistido: la tarea cambiada lo refleja y el resto no
    repository.setAiTaskSettings({
      ...DEFAULT_AI_TASK_SETTINGS,
      assistantInteractive: { model: 'claude-sonnet-5', thinking: true }
    })
    expect(resolveTaskConfig('assistantInteractive')).toEqual({
      model: 'claude-sonnet-5',
      thinking: true
    })
    expect(resolveTaskConfig('noteGeneration')).toEqual(DEFAULT_AI_TASK_SETTINGS.noteGeneration)

    // Un db.json corrupto se recupera como almacén vacío → defaults, sin lanzar
    writeFileSync(join(baseDir, 'db.json'), '{corrupto')
    initStore(baseDir)
    expect(resolveTaskConfig('assistantInteractive')).toEqual(
      DEFAULT_AI_TASK_SETTINGS.assistantInteractive
    )
  })
})
