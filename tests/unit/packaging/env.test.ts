// @vitest-environment node
/**
 * Tests de src/main/env.ts (SPEC-005): en la app empaquetada la key vive en
 * userData de Maurya (~/Library/Application Support/Maurya/.env.local), así
 * que ese candidato debe ir PRIMERO. Electron mockeado; fs real en temporales.
 */
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { loadLocalEnv } from '../../../src/main/env'

const paths = vi.hoisted(() => ({ userData: '', appPath: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (): string => paths.userData,
    getAppPath: (): string => paths.appPath
  }
}))

describe('loadLocalEnv', () => {
  describe('when .env.local exists both in userData and in the app path', () => {
    // SPEC-005 · AC-09 (parcial: la app empaquetada lee la key desde el userData de Maurya)
    it('reads the userData candidate first and never overwrites variables already defined in process.env', () => {
      const userDataDir = mkdtempSync(join(tmpdir(), 'maurya-env-userdata-'))
      const appDir = mkdtempSync(join(tmpdir(), 'maurya-env-apppath-'))
      paths.userData = userDataDir
      paths.appPath = appDir

      writeFileSync(
        join(userDataDir, '.env.local'),
        'SPEC005_ORDER=from-user-data\nSPEC005_PRESET=should-not-win\n'
      )
      // Si el orden de candidatos fuera el antiguo (appPath primero), ganaría este
      writeFileSync(join(appDir, '.env.local'), 'SPEC005_ORDER=from-app-path\n')

      process.env['SPEC005_PRESET'] = 'original'
      try {
        loadLocalEnv()
        // userData va PRIMERO en la lista de candidatos
        expect(process.env['SPEC005_ORDER']).toBe('from-user-data')
        // Una variable ya definida en el entorno no se pisa
        expect(process.env['SPEC005_PRESET']).toBe('original')
      } finally {
        delete process.env['SPEC005_ORDER']
        delete process.env['SPEC005_PRESET']
      }
    })
  })
})
