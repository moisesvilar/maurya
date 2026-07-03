// @vitest-environment node
/**
 * Tests de la resolución de la clave Deepgram (SPEC-007) en
 * src/main/transcriptionService.ts. getApiKey no se exporta: se ejercita por
 * su vía pública (startTranscription → apiKey con el que se abre la conexión).
 * secretsService REAL con safeStorage mockeado reversible; DeepgramConnection
 * mockeada (sin red).
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeepgramCallbacks } from '../../../src/main/deepgramService'
import { initSecrets, saveSecret } from '../../../src/main/secretsService'
import { resetTranscription, startTranscription } from '../../../src/main/transcriptionService'

const electronMock = vi.hoisted(() => ({ encryptionAvailable: true }))

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initSecrets recibe baseDir inyectado')
    }
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => electronMock.encryptionAvailable,
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

interface FakeConnection {
  apiKey: string
  callbacks: DeepgramCallbacks
}

const harness = vi.hoisted(() => ({
  instances: [] as unknown[]
}))

vi.mock('../../../src/main/deepgramService', () => ({
  DeepgramConnection: class {
    apiKey: string
    callbacks: DeepgramCallbacks
    opened = false
    isOpen = false
    sendAudio = vi.fn(() => true)
    sendKeepAlive = vi.fn()
    closeStream = vi.fn()
    terminate = vi.fn()

    constructor(apiKey: string, callbacks: DeepgramCallbacks) {
      this.apiKey = apiKey
      this.callbacks = callbacks
      harness.instances.push(this)
    }
  },
  classifyConnectionFailure: vi.fn(() => Promise.resolve('other' as const))
}))

function createSender(): { sender: WebContents; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn()
  const senderLike = {
    isDestroyed: (): boolean => false,
    send
  }
  return { sender: senderLike as unknown as WebContents, send }
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.instances.length = 0
  electronMock.encryptionAvailable = true
  resetTranscription()
  delete process.env['DEEPGRAM_API_KEY']
  // Almacén de secretos vacío y limpio por test
  initSecrets(mkdtempSync(join(tmpdir(), 'maurya-getapikey-')))
})

afterEach(() => {
  resetTranscription()
  delete process.env['DEEPGRAM_API_KEY']
})

describe('transcriptionService (resolución de la clave Deepgram)', () => {
  describe('when a key is saved in Settings AND .env.local has one', () => {
    // SPEC-007 · AC-07
    it('opens the Deepgram connection with the Settings key (it takes precedence over the env fallback)', () => {
      saveSecret('deepgram', 'clave-de-ajustes-1234')
      process.env['DEEPGRAM_API_KEY'] = 'clave-de-env-9999'

      startTranscription(createSender().sender)

      expect(harness.instances).toHaveLength(1)
      expect((harness.instances[0] as FakeConnection).apiKey).toBe('clave-de-ajustes-1234')
    })
  })

  describe('when there is no Settings key but .env.local has one', () => {
    // SPEC-007 · AC-08
    it('falls back to the DEEPGRAM_API_KEY from the environment (current dev flow)', () => {
      process.env['DEEPGRAM_API_KEY'] = 'clave-de-env-9999'

      startTranscription(createSender().sender)

      expect(harness.instances).toHaveLength(1)
      expect((harness.instances[0] as FakeConnection).apiKey).toBe('clave-de-env-9999')
    })
  })

  describe('when there is no key anywhere', () => {
    // SPEC-007 · AC-09
    it('keeps the SPEC-002 behavior: no-key status and no connection attempt', () => {
      const { sender, send } = createSender()

      startTranscription(sender)

      expect(harness.instances).toHaveLength(0)
      expect(send).toHaveBeenCalledWith('transcription:status', { status: 'no-key' })
    })
  })
})
