import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'fs'
import { join } from 'path'
import { writeFileAtomicSync } from '../atomicFile'
import type {
  Company,
  Contact,
  DbError,
  DbStatus,
  Discovery,
  Interview,
  InterviewTemplate,
  Note,
  NoteTemplate
} from '../../renderer/src/types/domain'
import { storageError } from './errors'

/** Forma completa del almacén persistido en userData/maurya-data/db.json. */
export interface DbData {
  schemaVersion: number
  discoveries: Discovery[]
  companies: Company[]
  contacts: Contact[]
  interviewTemplates: InterviewTemplate[]
  interviews: Interview[]
  noteTemplates: NoteTemplate[]
  notes: Note[]
}

const SCHEMA_VERSION = 1

const COLLECTIONS = [
  'discoveries',
  'companies',
  'contacts',
  'interviewTemplates',
  'interviews',
  'noteTemplates',
  'notes'
] as const

let data: DbData | null = null
let dbFilePath = ''
let initError: DbError | null = null

function emptyData(): DbData {
  return {
    schemaVersion: SCHEMA_VERSION,
    discoveries: [],
    companies: [],
    contacts: [],
    interviewTemplates: [],
    interviews: [],
    noteTemplates: [],
    notes: []
  }
}

/** Chequeo estructural mínimo del JSON leído de disco. */
function isDbData(value: unknown): value is DbData {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  if (typeof record.schemaVersion !== 'number') {
    return false
  }
  return COLLECTIONS.every((collection) => Array.isArray(record[collection]))
}

/** Escritura atómica (tmp + fsync + rename) para no dejar nunca un db.json a medias. */
function persist(next: DbData): void {
  writeFileAtomicSync(dbFilePath, JSON.stringify(next, null, 2))
}

/**
 * Inicializa (o re-inicializa) el almacén. `baseDir` es inyectable para QA y
 * smoke tests; en producción se omite y se usa userData/maurya-data.
 * Si el archivo existe pero está corrupto, se conserva renombrado con sufijo
 * `.corrupt-<timestamp>`, se crea un almacén vacío y el error queda consultable
 * vía getStatus() — nunca se crashea ni se pierde el archivo dañado.
 */
export function initStore(baseDir?: string): void {
  const dir = baseDir ?? join(app.getPath('userData'), 'maurya-data')
  mkdirSync(dir, { recursive: true })
  dbFilePath = join(dir, 'db.json')
  initError = null

  if (!existsSync(dbFilePath)) {
    data = emptyData()
    persist(data)
    return
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(dbFilePath, 'utf-8'))
    if (!isDbData(parsed)) {
      throw new Error('estructura de datos inválida')
    }
    data = parsed
  } catch (error) {
    const corruptPath = `${dbFilePath}.corrupt-${Date.now()}`
    try {
      renameSync(dbFilePath, corruptPath)
    } catch {
      // si ni siquiera se puede renombrar, se sobrescribe: el initError ya lo reporta
    }
    initError = {
      kind: 'storage',
      message: `El archivo de datos estaba corrupto y se ha conservado en ${corruptPath}; se ha creado un almacén vacío. Detalle: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
    data = emptyData()
    persist(data)
  }
}

function requireData(): DbData {
  if (data === null) {
    throw storageError('La capa de persistencia no está inicializada')
  }
  return data
}

/** Lectura sobre el snapshot vigente (nunca lo mutar: usar mutate para escribir). */
export function read<T>(selector: (store: DbData) => T): T {
  return selector(requireData())
}

/**
 * Ejecuta una mutación transaccional: `fn` trabaja sobre un structuredClone del
 * almacén y el resultado SOLO se persiste y publica si `fn` no lanza (si valida
 * y falla, "no persiste nada" literalmente). Invariante de serialización: toda
 * mutación es síncrona y llega por ipcMain.handle, que despacha secuencialmente
 * en el hilo principal → dos escrituras nunca se solapan y no hay pérdidas por
 * concurrencia (AC de escrituras encadenadas).
 */
export function mutate<T>(fn: (draft: DbData) => T): T {
  const current = requireData()
  const draft = structuredClone(current)
  const result = fn(draft)
  try {
    persist(draft)
  } catch (error) {
    throw storageError(
      `No se pudo escribir el archivo de datos: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
  data = draft
  return result
}

/** Estado consultable por pull desde el renderer (db:get-status). */
export function getStatus(): DbStatus {
  return { ready: data !== null, initError }
}
