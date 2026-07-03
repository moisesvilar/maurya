// @vitest-environment node
/**
 * Tests de src/main/secretsService.ts (SPEC-007) con electron mockeado:
 * safeStorage reversible (prefijo ENCv1 + base64) e isEncryptionAvailable
 * conmutable; initSecrets(baseDir) con fs real en temporal (patrón SPEC-006).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDecryptedSecret,
  getSecretsStatus,
  initSecrets,
  removeSecret,
  saveSecret,
  SecretsOperationError
} from '../../../src/main/secretsService'
import type { SecretsErrorKind } from '../../../src/renderer/src/types/secrets'

const electronMock = vi.hoisted(() => ({ encryptionAvailable: true }))

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initSecrets recibe baseDir inyectado')
    }
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => electronMock.encryptionAvailable,
    // Cifrado reversible de mentira: prefijo + base64 (nunca contiene el plaintext literal)
    encryptString: (plain: string): Buffer =>
      Buffer.from(`ENCv1:${Buffer.from(plain, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (blob: Buffer): string => {
      const text = blob.toString('utf8')
      if (!text.startsWith('ENCv1:')) {
        throw new Error('blob no cifrado por este mock')
      }
      return Buffer.from(text.slice('ENCv1:'.length), 'base64').toString('utf8')
    }
  }
}))

let baseDir = ''
let secretsPath = ''

function readRawFile(): string {
  return readFileSync(secretsPath, 'utf-8')
}

function expectSecretsError(fn: () => unknown, kind: SecretsErrorKind): void {
  let caught: unknown = null
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(SecretsOperationError)
  expect((caught as SecretsOperationError).kind).toBe(kind)
}

beforeEach(() => {
  electronMock.encryptionAvailable = true
  baseDir = mkdtempSync(join(tmpdir(), 'maurya-secrets-'))
  secretsPath = join(baseDir, 'secrets.json')
  initSecrets(baseDir)
})

describe('secretsService', () => {
  describe('when a key is saved', () => {
    // SPEC-007 · AC-03 (mitad main) + AC-04
    it('reports configured status with the correct last4 and never writes the plaintext to disk', () => {
      const plaintext = 'sk-deepgram-super-secreta-abcd'
      const status = saveSecret('deepgram', plaintext)

      expect(status).toEqual({ configured: true, last4: 'abcd' })
      expect(getSecretsStatus().deepgram).toEqual({ configured: true, last4: 'abcd' })

      // El archivo persiste el blob cifrado + last4, jamás la clave en claro
      const raw = readRawFile()
      expect(raw).not.toContain(plaintext)
      expect(raw).toContain('"last4": "abcd"')
      // Y el roundtrip de descifrado (consumo exclusivo de main) recupera el valor
      expect(getDecryptedSecret('deepgram')).toBe(plaintext)
    })
  })

  describe('when the app restarts over the same data directory', () => {
    // SPEC-007 · AC-05
    it('keeps the configured status with the same last4 after re-initializing from disk', () => {
      saveSecret('deepgram', 'sk-deepgram-super-secreta-abcd')
      saveSecret('anthropic', 'sk-ant-api-key-wxyz')

      // Simula cierre + reapertura: re-init sobre el mismo baseDir relee el disco
      initSecrets(baseDir)

      const status = getSecretsStatus()
      expect(status.deepgram).toEqual({ configured: true, last4: 'abcd' })
      expect(status.anthropic).toEqual({ configured: true, last4: 'wxyz' })
    })
  })

  describe('when encryption is not available', () => {
    // SPEC-007 · AC-13 (mitad main: nunca se guarda una clave sin cifrar)
    it('fails saving with encryption-unavailable and leaves the store file untouched', () => {
      const before = readRawFile()
      electronMock.encryptionAvailable = false

      expectSecretsError(
        () => saveSecret('deepgram', 'sk-no-debe-guardarse'),
        'encryption-unavailable'
      )

      expect(readRawFile()).toBe(before)
      expect(getSecretsStatus().deepgram).toEqual({ configured: false, last4: null })
    })
  })

  describe('when a configured key is removed', () => {
    // SPEC-007 · AC-11 (mitad main: la clave desaparece del almacenamiento cifrado)
    it('removes the entry from the encrypted store on disk', () => {
      saveSecret('deepgram', 'sk-deepgram-super-secreta-abcd')

      const status = removeSecret('deepgram')

      expect(status).toEqual({ configured: false, last4: null })
      expect(getSecretsStatus().deepgram).toEqual({ configured: false, last4: null })
      const persisted = JSON.parse(readRawFile()) as { keys: Record<string, unknown> }
      expect(persisted.keys.deepgram).toBeUndefined()
      expect(getDecryptedSecret('deepgram')).toBeNull()
    })
  })

  describe('when a key is saved over an existing one', () => {
    // SPEC-007 · AC-14
    it('replaces the previous key directly, updating last4 and the decrypted value', () => {
      saveSecret('deepgram', 'primera-clave-aaaa')
      const status = saveSecret('deepgram', 'segunda-clave-zzzz')

      expect(status).toEqual({ configured: true, last4: 'zzzz' })
      expect(getDecryptedSecret('deepgram')).toBe('segunda-clave-zzzz')
      const raw = readRawFile()
      expect(raw).not.toContain('primera-clave-aaaa')
    })
  })

  describe('when secrets.json is corrupt at startup', () => {
    // SPEC-007 · robustez extra (patrón SPEC-006; sin AC propio en la spec)
    it('keeps the damaged file as .corrupt-* and starts an empty working store without crashing', () => {
      const garbage = '{esto no es json'
      writeFileSync(secretsPath, garbage)

      expect(() => initSecrets(baseDir)).not.toThrow()

      const corruptFiles = readdirSync(baseDir).filter((name) =>
        /^secrets\.json\.corrupt-\d+$/.test(name)
      )
      expect(corruptFiles).toHaveLength(1)
      expect(readFileSync(join(baseDir, corruptFiles[0]), 'utf-8')).toBe(garbage)
      expect(existsSync(secretsPath)).toBe(true)
      expect(getSecretsStatus().deepgram).toEqual({ configured: false, last4: null })
      expect(saveSecret('deepgram', 'clave-tras-recuperacion-9999').last4).toBe('9999')
    })
  })
})
