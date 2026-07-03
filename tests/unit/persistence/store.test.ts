// @vitest-environment node
/**
 * Tests del store JSON (SPEC-006): supervivencia a reinicios y recuperación
 * de corrupción. fs real en directorio temporal; initStore(baseDir) inyectable
 * (re-init sobre el mismo baseDir = simulación de reinicio de la app).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCompany,
  createDiscovery,
  createInterviewTemplate,
  getCompany,
  getInterviewTemplate,
  listDiscoveries
} from '../../../src/main/db/repository'
import { getStatus, initStore } from '../../../src/main/db/store'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  }
}))

let baseDir = ''
let dbPath = ''

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'maurya-store-'))
  dbPath = join(baseDir, 'db.json')
  initStore(baseDir)
})

describe('store', () => {
  describe('when the app restarts over the same data directory', () => {
    // SPEC-006 · AC-08
    it('keeps every entity intact after re-initializing the store from disk', () => {
      const discovery = createDiscovery({ name: 'Discovery Maurya' })
      const company = createCompany({
        discoveryId: discovery.id,
        name: 'Acme Corp',
        website: 'https://acme.example',
        linkedinUrl: null
      })
      const template = createInterviewTemplate({
        name: 'Guión exploratorio',
        phase: 'problem',
        blocks: [{ title: 'Bloque único', questions: [{ text: '¿Pregunta?' }] }]
      })

      // Simula cierre + reapertura: re-init sobre el mismo baseDir relee el disco
      initStore(baseDir)

      expect(getStatus()).toEqual({ ready: true, initError: null })
      expect(listDiscoveries()).toEqual([discovery])
      expect(getCompany(company.id)).toEqual(company)
      expect(getInterviewTemplate(template.id)).toEqual(template)
    })
  })

  describe('when the data file is corrupt at startup', () => {
    // SPEC-006 · AC-15
    it('does not crash: reports a typed storage initError, keeps the damaged file as .corrupt-* and starts an empty working store', () => {
      const garbage = '{esto no es json válido «💥»'
      writeFileSync(dbPath, garbage)

      // Re-init sobre el archivo corrupto: nunca lanza
      expect(() => initStore(baseDir)).not.toThrow()

      // Error tipado consultable vía getStatus (db:get-status en el bridge)
      const status = getStatus()
      expect(status.ready).toBe(true)
      expect(status.initError).not.toBeNull()
      expect(status.initError?.kind).toBe('storage')

      // El archivo dañado se conserva renombrado con sufijo .corrupt-<timestamp>
      const corruptFiles = readdirSync(baseDir).filter((name) =>
        /^db\.json\.corrupt-\d+$/.test(name)
      )
      expect(corruptFiles).toHaveLength(1)
      expect(readFileSync(join(baseDir, corruptFiles[0]), 'utf-8')).toBe(garbage)

      // Y hay un almacén nuevo vacío y operativo en su lugar
      expect(existsSync(dbPath)).toBe(true)
      expect(listDiscoveries()).toEqual([])
      const created = createDiscovery({ name: 'Discovery tras recuperación' })
      expect(listDiscoveries()).toEqual([created])
    })
  })
})
