// @vitest-environment node
/**
 * SPEC-025: invariante de invalidación de la evaluación en el repositorio
 * (store REAL sobre directorio temporal, patrón SPEC-006). Cualquier cambio en
 * la lista `objectives` descarta `objectiveResults` (los resultados están
 * alineados por índice); si la lista no cambia, la evaluación se conserva.
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import type { Interview, ObjectiveResult } from '../../../src/renderer/src/types/domain'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (plain: string): Buffer => Buffer.from(plain, 'utf8'),
    decryptString: (blob: Buffer): string => blob.toString('utf8')
  }
}))

const RESULTS: ObjectiveResult[] = [
  { met: true, reason: 'Se obtuvo el dato concreto con cifras reales.' },
  { met: false, reason: 'No se llegó a tocar este tema con hechos pasados.' }
]

/** Entrevista con guión, 2 objetivos y la evaluación de SPEC-025 persistida. */
function seedEvaluated(): Interview {
  const discovery = repository.createDiscovery({ name: 'Discovery Maurya' })
  const created = repository.createInterview({
    discoveryId: discovery.id,
    title: 'Discovery con Acme'
  })
  repository.updateInterview(created.id, {
    scriptMarkdown: '# Guión adaptado',
    objectives: ['Objetivo cero', 'Objetivo uno'],
    status: 'prepared'
  })
  return repository.setInterviewObjectiveResults(created.id, RESULTS)
}

beforeEach(() => {
  initStore(mkdtempSync(join(tmpdir(), 'maurya-repo-objectives-')))
})

describe('repository objectiveResults invalidation', () => {
  // SPEC-025 · AC-24
  it('clears objectiveResults when the objectives list changes on update', () => {
    const interview = seedEvaluated()
    expect(interview.objectiveResults).toEqual(RESULTS)

    // Edición del usuario: cambia el texto de un objetivo (misma longitud)
    const updated = repository.updateInterview(interview.id, {
      scriptMarkdown: '# Guión adaptado',
      objectives: ['Objetivo cero', 'Objetivo uno editado']
    })

    expect(updated.objectiveResults ?? null).toBeNull()
    expect(repository.getInterview(interview.id).objectiveResults ?? null).toBeNull()
  })

  // SPEC-025 · AC-25
  it('keeps objectiveResults when only the script changes', () => {
    const interview = seedEvaluated()

    // Guardado del Guión sin tocar los objetivos (misma lista, mismo orden)
    const updated = repository.updateInterview(interview.id, {
      scriptMarkdown: '# Guión adaptado\nLínea añadida',
      objectives: ['Objetivo cero', 'Objetivo uno']
    })

    expect(updated.objectiveResults).toEqual(RESULTS)
  })

  // SPEC-025 · AC-26 (regeneración: guión + objetivos sobrescritos, patrón llmService)
  it('clears objectiveResults when objectives are overwritten by regeneration', () => {
    const interview = seedEvaluated()

    const updated = repository.updateInterview(interview.id, {
      scriptMarkdown: '# Guión regenerado',
      objectives: ['Objetivo nuevo A', 'Objetivo nuevo B', 'Objetivo nuevo C'],
      status: 'prepared'
    })

    expect(updated.objectiveResults ?? null).toBeNull()
  })
})
