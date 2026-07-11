// @vitest-environment node
/**
 * SPEC-028: mutación setInterviewObjectiveOverride y extensión de la
 * invariante de invalidación del repositorio (store REAL sobre directorio
 * temporal, patrón repository.objectives.test.ts de SPEC-025). Las marcas
 * manuales están alineadas por índice con `objectives`: cualquier cambio de la
 * lista las descarta — con condición INDEPENDIENTE de la de objectiveResults
 * (puede haber marcas sin evaluación persistida).
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import type {
  Interview,
  ObjectiveOverride,
  ObjectiveResult
} from '../../../src/renderer/src/types/domain'

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

const OVERRIDE: ObjectiveOverride = {
  met: true,
  comment: 'El cliente confirmó la compra con una orden firmada.',
  text: 'El gasto de 200 € culminó en una orden firmada, según el entrevistador.'
}

const RESULTS: ObjectiveResult[] = [
  { met: false, reason: 'Solo se registró un gasto de 200 € sin decisión de compra.' },
  { met: true, reason: 'Se obtuvo el dato concreto con cifras del último trimestre.' }
]

/** Entrevista con guión y los objetivos indicados (sin evaluación ni marcas). */
function seedInterview(objectives: string[] = ['Objetivo cero', 'Objetivo uno']): Interview {
  const discovery = repository.createDiscovery({ name: 'Discovery Maurya' })
  const created = repository.createInterview({
    discoveryId: discovery.id,
    title: 'Discovery con Acme'
  })
  return repository.updateInterview(created.id, {
    scriptMarkdown: '# Guión adaptado',
    objectives,
    status: 'prepared'
  })
}

beforeEach(() => {
  initStore(mkdtempSync(join(tmpdir(), 'maurya-repo-overrides-')))
})

describe('repository objectiveOverrides', () => {
  describe('setInterviewObjectiveOverride', () => {
    // Notas técnicas: array alineado por índice; entrada null = sin marca manual
    it('writes the override aligned by index leaving the other entries null', () => {
      const interview = seedInterview()

      const updated = repository.setInterviewObjectiveOverride(interview.id, 1, OVERRIDE)

      expect(updated.objectiveOverrides).toEqual([null, OVERRIDE])
      expect(repository.getInterview(interview.id).objectiveOverrides).toEqual([null, OVERRIDE])
    })

    // Rebase defensivo: cada escritura realinea a la longitud vigente conservando las marcas
    it('preserves existing overrides when rebasing the array to the objectives length', () => {
      const interview = seedInterview(['Objetivo cero', 'Objetivo uno', 'Objetivo dos'])
      const other: ObjectiveOverride = {
        met: false,
        comment: 'Solo hubo cumplidos de cortesía, sin hechos.',
        text: 'No hay evidencia concreta: la conversación quedó en generalidades.'
      }

      repository.setInterviewObjectiveOverride(interview.id, 2, OVERRIDE)
      const updated = repository.setInterviewObjectiveOverride(interview.id, 0, other)

      expect(updated.objectiveOverrides).toEqual([other, null, OVERRIDE])
    })

    // Validación dentro del mutate: si lanza, cero escrituras (garantía del store)
    it('throws a validation error for an out-of-range or non-integer index without persisting', () => {
      const interview = seedInterview()

      expect(() => repository.setInterviewObjectiveOverride(interview.id, 2, OVERRIDE)).toThrow(
        'El objetivo indicado no existe en la entrevista'
      )
      expect(() => repository.setInterviewObjectiveOverride(interview.id, -1, OVERRIDE)).toThrow(
        'El objetivo indicado no existe en la entrevista'
      )
      expect(() => repository.setInterviewObjectiveOverride(interview.id, 0.5, OVERRIDE)).toThrow(
        'El objetivo indicado no existe en la entrevista'
      )
      expect(repository.getInterview(interview.id).objectiveOverrides ?? null).toBeNull()
    })

    // Patrón setInterviewObjectiveResults/addInterviewAiUsage: no reordena el listado
    it('does not touch updatedAt when persisting an override', () => {
      const interview = seedInterview()

      const updated = repository.setInterviewObjectiveOverride(interview.id, 0, OVERRIDE)

      expect(updated.updatedAt).toBe(interview.updatedAt)
    })
  })

  describe('updateInterview invalidation', () => {
    // SPEC-028 · AC-17: editar la lista descarta las marcas AUNQUE no haya evaluación
    it('clears objectiveOverrides when the objectives list changes even without a persisted evaluation', () => {
      const interview = seedInterview()
      repository.setInterviewObjectiveOverride(interview.id, 0, OVERRIDE)

      const updated = repository.updateInterview(interview.id, {
        scriptMarkdown: '# Guión adaptado',
        objectives: ['Objetivo cero', 'Objetivo uno editado']
      })

      expect(updated.objectiveOverrides ?? null).toBeNull()
      expect(repository.getInterview(interview.id).objectiveOverrides ?? null).toBeNull()
    })

    // SPEC-028 · AC-18: la regeneración (guión + objetivos sobrescritos) descarta marcas y evaluación
    it('clears objectiveOverrides together with objectiveResults when regeneration overwrites the objectives', () => {
      const interview = seedInterview()
      repository.setInterviewObjectiveResults(interview.id, RESULTS)
      repository.setInterviewObjectiveOverride(interview.id, 0, OVERRIDE)

      const updated = repository.updateInterview(interview.id, {
        scriptMarkdown: '# Guión regenerado',
        objectives: ['Objetivo nuevo A', 'Objetivo nuevo B', 'Objetivo nuevo C'],
        status: 'prepared'
      })

      expect(updated.objectiveOverrides ?? null).toBeNull()
      expect(updated.objectiveResults ?? null).toBeNull()
    })

    // Contraparte de la invariante: guardar solo el guión (misma lista) conserva las marcas
    it('keeps objectiveOverrides when only the script changes', () => {
      const interview = seedInterview()
      repository.setInterviewObjectiveOverride(interview.id, 0, OVERRIDE)

      const updated = repository.updateInterview(interview.id, {
        scriptMarkdown: '# Guión adaptado\nLínea añadida',
        objectives: ['Objetivo cero', 'Objetivo uno']
      })

      expect(updated.objectiveOverrides).toEqual([OVERRIDE, null])
    })
  })
})
