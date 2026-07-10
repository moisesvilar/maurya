import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'fs'
import { join } from 'path'
import { writeFileAtomicSync } from '../atomicFile'
import type {
  AiCostSettings,
  Company,
  Contact,
  CustomPromptOverride,
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
  /**
   * Ajustes de coste de IA (SPEC-021): singleton opcional, sin bump de
   * schemaVersion (ausente = sin límite; isDbData lo tolera y persist lo
   * conserva). La lectura se normaliza defensivamente en el repositorio.
   */
  aiCostSettings?: AiCostSettings
  /**
   * Overrides de prompts de IA (SPEC-026): colección opcional, sin bump de
   * schemaVersion (ausente = todos los prompts en default; isDbData lo tolera
   * y persist lo conserva). La lectura se normaliza en el repositorio.
   */
  customPrompts?: CustomPromptOverride[]
}

/** v2 (SPEC-020): Interview gana discoveryId obligatorio y companyId nullable. */
const SCHEMA_VERSION = 2

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

/**
 * Migración v1 → v2 (SPEC-020): backfill de `Interview.discoveryId` desde la
 * empresa de cada entrevista. Una entrevista v1 cuya empresa no resuelve (dato
 * inconsistente, hoy inalcanzable desde la UI) se elimina junto con su nota —
 * decisión documentada en el plan, coherente con la cascada de borrado.
 * En v1 `companyId` nunca es null; el chequeo defensivo cubre datos anómalos.
 */
function migrateV1ToV2(v1: DbData): DbData {
  const companiesById = new Map<string, Company>(
    v1.companies.map((company) => [company.id, company])
  )
  const interviews: Interview[] = []
  const droppedInterviewIds = new Set<string>()
  for (const interview of v1.interviews) {
    const company =
      interview.companyId !== null ? companiesById.get(interview.companyId) : undefined
    if (company === undefined) {
      droppedInterviewIds.add(interview.id)
      continue
    }
    interviews.push({ ...interview, discoveryId: company.discoveryId })
  }
  return {
    ...v1,
    schemaVersion: 2,
    interviews,
    notes: v1.notes.filter((note) => !droppedInterviewIds.has(note.interviewId))
  }
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
    // Migración síncrona ANTES del primer mutate (SPEC-020); se persiste
    // atómica. Si falla, cae en el camino `.corrupt-<ts>` de abajo.
    if (parsed.schemaVersion === 1) {
      data = migrateV1ToV2(parsed)
      persist(data)
    } else {
      data = parsed
    }
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
