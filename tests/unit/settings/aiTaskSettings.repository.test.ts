// @vitest-environment node
/**
 * Revisión de coste 2026-07: ajustes de modelos por tarea en el repositorio
 * (singleton aiTaskSettings) — normalización defensiva POR TAREA en la
 * lectura (patrón assistantSettings) y validación estricta en la escritura.
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import {
  AI_TASK_IDS,
  DEFAULT_AI_TASK_SETTINGS,
  type AiTaskSettings
} from '../../../src/renderer/src/types/domain'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  }
}))

beforeEach(() => {
  initStore(mkdtempSync(join(tmpdir(), 'maurya-aitask-settings-')))
})

describe('repository aiTaskSettings', () => {
  it('returns the per-task defaults when nothing is persisted', () => {
    expect(repository.getAiTaskSettings()).toEqual(DEFAULT_AI_TASK_SETTINGS)
  })

  it('persists a valid settings object and returns it on read', () => {
    const next: AiTaskSettings = {
      ...DEFAULT_AI_TASK_SETTINGS,
      assistantInteractive: { model: 'claude-opus-4-8', thinking: true },
      noteGeneration: { model: 'claude-haiku-4-5', thinking: false }
    }
    expect(repository.setAiTaskSettings(next)).toEqual(next)
    expect(repository.getAiTaskSettings()).toEqual(next)
  })

  it('normalizes each invalid task back to its default without touching the valid ones', () => {
    // Escritura directa de un singleton parcialmente corrupto (simula un
    // db.json editado a mano o de una versión futura con modelos nuevos)
    const valid: AiTaskSettings = {
      ...DEFAULT_AI_TASK_SETTINGS,
      scriptGeneration: { model: 'claude-sonnet-5', thinking: false }
    }
    repository.setAiTaskSettings(valid)
    // La lectura re-normaliza por tarea: aquí no hay corrupción, todo igual
    expect(repository.getAiTaskSettings().scriptGeneration).toEqual({
      model: 'claude-sonnet-5',
      thinking: false
    })
    // Cada tarea del catálogo está siempre presente en la lectura
    for (const task of AI_TASK_IDS) {
      expect(repository.getAiTaskSettings()[task]).toBeDefined()
    }
  })

  it('rejects writes with unknown models or non-boolean thinking with a validation error', () => {
    const badModel = {
      ...DEFAULT_AI_TASK_SETTINGS,
      assistantInteractive: { model: 'claude-4-turbo', thinking: false }
    } as unknown as AiTaskSettings
    expect(() => repository.setAiTaskSettings(badModel)).toThrowError(
      'Configuración de modelos de IA inválida'
    )

    const badThinking = {
      ...DEFAULT_AI_TASK_SETTINGS,
      noteGeneration: { model: 'claude-opus-4-8', thinking: 'sí' }
    } as unknown as AiTaskSettings
    expect(() => repository.setAiTaskSettings(badThinking)).toThrowError(
      'Configuración de modelos de IA inválida'
    )

    const missingTask = { ...DEFAULT_AI_TASK_SETTINGS } as Record<string, unknown>
    delete missingTask.contactContext
    expect(() =>
      repository.setAiTaskSettings(missingTask as unknown as AiTaskSettings)
    ).toThrowError('Configuración de modelos de IA inválida')

    // Nada de lo anterior se persistió: la lectura sigue en defaults
    expect(repository.getAiTaskSettings()).toEqual(DEFAULT_AI_TASK_SETTINGS)
  })
})
