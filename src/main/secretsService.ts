import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'fs'
import { join } from 'path'
import type {
  KeyStatus,
  SecretKind,
  SecretsError,
  SecretsErrorKind,
  SecretsStatus
} from '../renderer/src/types/secrets'
import { writeFileAtomicSync } from './atomicFile'

/**
 * Almacén de claves de IA (SPEC-007). Los valores se cifran con safeStorage
 * (Keychain en macOS) y se persisten como blobs base64 en
 * `userData/maurya-data/secrets.json`, separados de db.json para que backups
 * o inspecciones del dominio no arrastren secretos.
 *
 * Invariantes de seguridad:
 * - NUNCA se persiste una clave sin cifrar (si el cifrado no está disponible,
 *   saveSecret falla con `encryption-unavailable`).
 * - El plaintext jamás se loguea ni sale de main: getDecryptedSecret es de
 *   consumo exclusivo del main process (transcriptionService, y H3 en su día).
 * - `safeStorage.isEncryptionAvailable()` solo se consulta en handlers post
 *   app.whenReady(); initSecrets no lo toca (pre-ready sería inválido).
 */

const SCHEMA_VERSION = 1
const SECRET_KINDS: readonly SecretKind[] = ['deepgram', 'anthropic', 'linkedinMcp'] as const

/** Blob cifrado (base64) + últimos 4 en claro para mostrar estado sin descifrar. */
interface StoredSecret {
  blob: string
  last4: string
}

interface SecretsData {
  schemaVersion: number
  keys: Partial<Record<SecretKind, StoredSecret>>
}

/** Error interno tipado de la capa de secretos; el IPC lo aplana a SecretsError. */
export class SecretsOperationError extends Error {
  readonly kind: SecretsErrorKind

  constructor(kind: SecretsErrorKind, message: string) {
    super(message)
    this.name = 'SecretsOperationError'
    this.kind = kind
  }
}

/** Aplana cualquier error a SecretsError; lo no tipado se reporta como `storage`. */
export function toSecretsError(error: unknown): SecretsError {
  if (error instanceof SecretsOperationError) {
    return { kind: error.kind, message: error.message }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { kind: 'storage', message }
}

let data: SecretsData | null = null
let secretsFilePath = ''

function emptyData(): SecretsData {
  return { schemaVersion: SCHEMA_VERSION, keys: {} }
}

function isStoredSecret(value: unknown): value is StoredSecret {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.blob === 'string' && typeof record.last4 === 'string'
}

/** Chequeo estructural mínimo del JSON leído de disco. */
function isSecretsData(value: unknown): value is SecretsData {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  if (typeof record.schemaVersion !== 'number') {
    return false
  }
  const keys = record.keys
  if (typeof keys !== 'object' || keys === null) {
    return false
  }
  return SECRET_KINDS.every((kind) => {
    const entry = (keys as Record<string, unknown>)[kind]
    return entry === undefined || isStoredSecret(entry)
  })
}

function persist(next: SecretsData): void {
  try {
    writeFileAtomicSync(secretsFilePath, JSON.stringify(next, null, 2))
  } catch (error) {
    throw new SecretsOperationError(
      'storage',
      `No se pudo escribir el archivo de secretos: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/**
 * Inicializa (o re-inicializa) el almacén de secretos. `baseDir` es inyectable
 * para QA; en producción se omite y se usa userData/maurya-data. Un archivo
 * corrupto se conserva renombrado `.corrupt-<timestamp>` y se parte de un
 * almacén vacío — nunca se crashea. NO consulta safeStorage (pre-ready).
 */
export function initSecrets(baseDir?: string): void {
  const dir = baseDir ?? join(app.getPath('userData'), 'maurya-data')
  mkdirSync(dir, { recursive: true })
  secretsFilePath = join(dir, 'secrets.json')

  if (!existsSync(secretsFilePath)) {
    data = emptyData()
    persist(data)
    console.log(`[secrets] almacén de secretos creado en ${secretsFilePath}`)
    return
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(secretsFilePath, 'utf-8'))
    if (!isSecretsData(parsed)) {
      throw new Error('estructura de secretos inválida')
    }
    data = parsed
    console.log(`[secrets] almacén de secretos leído de ${secretsFilePath}`)
  } catch (error) {
    const corruptPath = `${secretsFilePath}.corrupt-${Date.now()}`
    try {
      renameSync(secretsFilePath, corruptPath)
    } catch {
      // si ni siquiera se puede renombrar, se sobrescribe con el almacén vacío
    }
    console.warn(
      `[secrets] secrets.json corrupto; conservado en ${corruptPath}. Detalle: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    data = emptyData()
    persist(data)
  }
}

function requireData(): SecretsData {
  if (data === null) {
    throw new SecretsOperationError('storage', 'El almacén de secretos no está inicializado')
  }
  return data
}

function toKeyStatus(entry: StoredSecret | undefined): KeyStatus {
  return entry !== undefined
    ? { configured: true, last4: entry.last4 }
    : { configured: false, last4: null }
}

/** Snapshot para la página de Ajustes: disponibilidad de cifrado + estado por clave. */
export function getSecretsStatus(): SecretsStatus {
  const store = requireData()
  return {
    available: safeStorage.isEncryptionAvailable(),
    deepgram: toKeyStatus(store.keys.deepgram),
    anthropic: toKeyStatus(store.keys.anthropic),
    linkedinMcp: toKeyStatus(store.keys.linkedinMcp)
  }
}

/**
 * Guarda (o sustituye sin paso intermedio) la clave `kind`. Valida el trim,
 * exige cifrado disponible y persiste SOLO el blob cifrado + last4.
 */
export function saveSecret(kind: SecretKind, value: string): KeyStatus {
  const store = requireData()
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new SecretsOperationError('validation', 'Introduce una clave')
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new SecretsOperationError(
      'encryption-unavailable',
      'No es posible guardar claves de forma segura en este equipo: el cifrado del sistema no está disponible.'
    )
  }
  const blob = safeStorage.encryptString(trimmed).toString('base64')
  const next: SecretsData = {
    ...store,
    keys: { ...store.keys, [kind]: { blob, last4: trimmed.slice(-4) } }
  }
  persist(next)
  data = next
  return toKeyStatus(next.keys[kind])
}

/** Elimina la clave `kind` del almacén cifrado (idempotente). */
export function removeSecret(kind: SecretKind): KeyStatus {
  const store = requireData()
  const keys = { ...store.keys }
  delete keys[kind]
  const next: SecretsData = { ...store, keys }
  persist(next)
  data = next
  return { configured: false, last4: null }
}

/**
 * Descifra la clave `kind` para consumo EXCLUSIVO del main process (jamás se
 * envía al renderer ni se loguea). Devuelve null si no hay clave o si el
 * descifrado falla (p. ej. Keychain de otro equipo): el caller degrada a env.
 */
export function getDecryptedSecret(kind: SecretKind): string | null {
  if (data === null) {
    return null
  }
  const entry = data.keys[kind]
  if (entry === undefined) {
    return null
  }
  try {
    return safeStorage.decryptString(Buffer.from(entry.blob, 'base64'))
  } catch {
    return null
  }
}
