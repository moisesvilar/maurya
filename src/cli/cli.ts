/**
 * CLI de Maurya: expone el repositorio de dominio (src/main/db) como ejecutable
 * de línea de comandos para agentes (Claude Code, scripts). Reutiliza la MISMA
 * capa de persistencia que la app (validaciones, integridad referencial,
 * cascadas y escritura atómica) sobre el db.json de userData.
 *
 * Contrato de salida (pensado para consumo por agentes): SIEMPRE un único JSON
 * en stdout con el envelope del dominio `{ ok: true, data } | { ok: false,
 * error: { kind, message } }` y exit code 0/1. El texto de ayuda es la única
 * salida no-JSON, y solo se emite bajo `--help`/`help`.
 *
 * Advertencia de concurrencia: la app Electron mantiene su snapshot en memoria
 * y persiste el almacén COMPLETO en cada mutación — si la app está abierta,
 * su siguiente escritura puede pisar lo creado por el CLI. Usar el CLI con la
 * app cerrada (o recargarla después).
 */

import { homedir } from 'os'
import { join } from 'path'
import { toDbError } from '../main/db/errors'
import {
  createCompany,
  createContact,
  createDiscovery,
  createInterview,
  createInterviewGroup,
  createInterviewTemplate,
  createNoteTemplate,
  deleteCompany,
  deleteContact,
  deleteDiscovery,
  deleteInterview,
  deleteInterviewGroup,
  deleteInterviewTemplate,
  deleteNoteTemplate,
  getCompany,
  getContact,
  getDiscovery,
  getInterview,
  getInterviewGroup,
  getInterviewTemplate,
  getNoteTemplate,
  listAllInterviews,
  listCompanies,
  listContacts,
  listDiscoveries,
  listInterviewGroups,
  listInterviews,
  listInterviewTemplates,
  listNoteTemplates,
  updateCompany,
  updateContact,
  updateDiscovery,
  updateInterview,
  updateInterviewGroup,
  updateInterviewTemplate,
  updateNoteTemplate
} from '../main/db/repository'
import { searchGlobal } from '../main/db/search'
import { getStatus, initStore } from '../main/db/store'
import type {
  CreateCompanyInput,
  CreateContactInput,
  CreateDiscoveryInput,
  CreateInterviewGroupInput,
  CreateInterviewInput,
  CreateInterviewTemplateInput,
  CreateNoteTemplateInput,
  UpdateCompanyPatch,
  UpdateContactPatch,
  UpdateDiscoveryPatch,
  UpdateInterviewGroupPatch,
  UpdateInterviewPatch,
  UpdateInterviewTemplatePatch,
  UpdateNoteTemplatePatch
} from '../renderer/src/types/domain'

export interface CliIo {
  out: (line: string) => void
  err: (line: string) => void
}

/** Error de uso del CLI (flags/argumentos), distinto de los errores del dominio. */
class UsageError extends Error {}

// ---------------------------------------------------------------------------
// Especificación declarativa de entidades y flags
// ---------------------------------------------------------------------------

interface FieldSpec {
  /** Flag kebab-case, p.ej. '--linkedin-url'. */
  flag: string
  /** Clave camelCase del payload del repositorio, p.ej. 'linkedinUrl'. */
  key: string
  /** 'string' = valor literal · 'json' = el valor se parsea como JSON (arrays/objetos). */
  kind: 'string' | 'json'
  required?: boolean
}

type Payload = Record<string, unknown>

interface EntitySpec {
  createFields: FieldSpec[]
  updateFields: FieldSpec[]
  /** Flags del list (p.ej. --company-id); el run recibe el payload parseado. */
  listFields: FieldSpec[]
  create: (input: Payload) => unknown
  list: (args: Payload) => unknown
  get: (id: string) => unknown
  update: (id: string, patch: Payload) => unknown
  remove: (id: string) => unknown
}

function f(
  flag: string,
  key: string,
  kind: 'string' | 'json' = 'string',
  required = false
): FieldSpec {
  return { flag, key, kind, required }
}

const ENTITIES: Record<string, EntitySpec> = {
  discovery: {
    createFields: [f('--name', 'name', 'string', true), f('--objectives', 'objectives')],
    updateFields: [f('--name', 'name'), f('--objectives', 'objectives')],
    listFields: [],
    create: (input) => createDiscovery(input as unknown as CreateDiscoveryInput),
    list: () => listDiscoveries(),
    get: getDiscovery,
    update: (id, patch) => updateDiscovery(id, patch as UpdateDiscoveryPatch),
    remove: deleteDiscovery
  },
  company: {
    createFields: [
      f('--name', 'name', 'string', true),
      f('--website', 'website'),
      f('--linkedin-url', 'linkedinUrl'),
      f('--context', 'context')
    ],
    updateFields: [
      f('--name', 'name'),
      f('--website', 'website'),
      f('--linkedin-url', 'linkedinUrl'),
      f('--context', 'context')
    ],
    listFields: [],
    create: (input) => createCompany(input as unknown as CreateCompanyInput),
    list: () => listCompanies(),
    get: getCompany,
    update: (id, patch) => updateCompany(id, patch as UpdateCompanyPatch),
    remove: deleteCompany
  },
  contact: {
    createFields: [
      f('--company-id', 'companyId', 'string', true),
      f('--name', 'name', 'string', true),
      f('--position', 'position'),
      f('--linkedin-url', 'linkedinUrl'),
      f('--context', 'context')
    ],
    updateFields: [
      f('--name', 'name'),
      f('--position', 'position'),
      f('--linkedin-url', 'linkedinUrl'),
      f('--context', 'context')
    ],
    listFields: [f('--company-id', 'companyId', 'string', true)],
    create: (input) => createContact(input as unknown as CreateContactInput),
    list: (args) => listContacts(args.companyId as string),
    get: getContact,
    update: (id, patch) => updateContact(id, patch as UpdateContactPatch),
    remove: deleteContact
  },
  'interview-template': {
    createFields: [
      f('--name', 'name', 'string', true),
      f('--phase', 'phase'),
      f('--blocks', 'blocks', 'json')
    ],
    updateFields: [f('--name', 'name'), f('--phase', 'phase'), f('--blocks', 'blocks', 'json')],
    listFields: [],
    create: (input) => createInterviewTemplate(input as unknown as CreateInterviewTemplateInput),
    list: () => listInterviewTemplates(),
    get: getInterviewTemplate,
    update: (id, patch) => updateInterviewTemplate(id, patch as UpdateInterviewTemplatePatch),
    remove: deleteInterviewTemplate
  },
  'interview-group': {
    createFields: [
      f('--discovery-id', 'discoveryId', 'string', true),
      f('--name', 'name', 'string', true),
      f('--objective', 'objective'),
      f('--interview-template-id', 'interviewTemplateId'),
      f('--note-template-id', 'noteTemplateId')
    ],
    updateFields: [
      f('--name', 'name'),
      f('--objective', 'objective'),
      f('--interview-template-id', 'interviewTemplateId'),
      f('--note-template-id', 'noteTemplateId')
    ],
    listFields: [f('--discovery-id', 'discoveryId', 'string', true)],
    create: (input) => createInterviewGroup(input as unknown as CreateInterviewGroupInput),
    list: (args) => listInterviewGroups(args.discoveryId as string),
    get: getInterviewGroup,
    update: (id, patch) => updateInterviewGroup(id, patch as UpdateInterviewGroupPatch),
    remove: deleteInterviewGroup
  },
  interview: {
    createFields: [
      f('--discovery-id', 'discoveryId', 'string', true),
      f('--title', 'title', 'string', true),
      f('--company-id', 'companyId'),
      f('--contact-ids', 'contactIds', 'json'),
      f('--interview-group-id', 'interviewGroupId'),
      f('--template-id', 'templateId')
    ],
    updateFields: [
      f('--title', 'title'),
      f('--status', 'status'),
      f('--contact-ids', 'contactIds', 'json'),
      f('--template-id', 'templateId'),
      f('--script-markdown', 'scriptMarkdown'),
      f('--objectives', 'objectives', 'json'),
      f('--wav-path', 'wavPath'),
      f('--transcript-path', 'transcriptPath')
    ],
    // Sin --company-id lista TODAS las capturas (vista global de la app).
    listFields: [f('--company-id', 'companyId')],
    create: (input) => createInterview(input as unknown as CreateInterviewInput),
    list: (args) =>
      typeof args.companyId === 'string' ? listInterviews(args.companyId) : listAllInterviews(),
    get: getInterview,
    update: (id, patch) => updateInterview(id, patch as UpdateInterviewPatch),
    remove: deleteInterview
  },
  'note-template': {
    createFields: [
      f('--name', 'name', 'string', true),
      f('--context', 'context'),
      f('--sections', 'sections', 'json')
    ],
    updateFields: [
      f('--name', 'name'),
      f('--context', 'context'),
      f('--sections', 'sections', 'json')
    ],
    listFields: [],
    create: (input) => createNoteTemplate(input as unknown as CreateNoteTemplateInput),
    list: () => listNoteTemplates(),
    get: getNoteTemplate,
    update: (id, patch) => updateNoteTemplate(id, patch as UpdateNoteTemplatePatch),
    remove: deleteNoteTemplate
  }
}

const ACTIONS = ['create', 'list', 'get', 'update', 'delete'] as const
type Action = (typeof ACTIONS)[number]

// ---------------------------------------------------------------------------
// Resolución del directorio de datos
// ---------------------------------------------------------------------------

/**
 * Réplica del userData por defecto de Electron para la app «Maurya»
 * (productName), + subcarpeta maurya-data (ver initStore). Overrides:
 * --data-dir > MAURYA_DATA_DIR > default de la plataforma.
 */
export function defaultDataDir(): string {
  const home = homedir()
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Maurya', 'maurya-data')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appData, 'Maurya', 'maurya-data')
  }
  const configDir = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
  return join(configDir, 'Maurya', 'maurya-data')
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Extrae `--data-dir <dir>` de cualquier posición y devuelve el resto de tokens. */
function extractDataDir(argv: string[]): { dataDir: string; rest: string[] } {
  const rest: string[] = []
  let dataDir: string | null = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data-dir') {
      const value = argv[i + 1]
      if (value === undefined) {
        throw new UsageError('El flag --data-dir requiere un directorio como valor')
      }
      dataDir = value
      i++
      continue
    }
    rest.push(argv[i])
  }
  return {
    dataDir: dataDir ?? process.env.MAURYA_DATA_DIR ?? defaultDataDir(),
    rest
  }
}

/**
 * Parsea flags `--flag valor` contra un spec. `--json '<objeto>'` aporta el
 * payload base; los flags individuales lo sobreescriben clave a clave (para
 * valores null o estructuras complejas, usar --json).
 */
function parsePayload(tokens: string[], fields: FieldSpec[], requireRequired: boolean): Payload {
  let base: Payload = {}
  const fromFlags: Payload = {}
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token.startsWith('--')) {
      throw new UsageError(`Argumento inesperado: ${token} (se esperaba un flag --...)`)
    }
    const value = tokens[i + 1]
    if (value === undefined) {
      throw new UsageError(`El flag ${token} requiere un valor`)
    }
    i++
    if (token === '--json') {
      let parsed: unknown
      try {
        parsed = JSON.parse(value)
      } catch {
        throw new UsageError('El valor de --json no es JSON válido')
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new UsageError('El valor de --json debe ser un objeto JSON')
      }
      base = { ...base, ...(parsed as Payload) }
      continue
    }
    const field = fields.find((candidate) => candidate.flag === token)
    if (field === undefined) {
      const known = fields
        .map((candidate) => candidate.flag)
        .concat('--json')
        .join(', ')
      throw new UsageError(`Flag desconocido: ${token}. Flags soportados: ${known}`)
    }
    if (field.kind === 'json') {
      try {
        fromFlags[field.key] = JSON.parse(value)
      } catch {
        throw new UsageError(`El valor de ${field.flag} debe ser JSON válido`)
      }
    } else {
      fromFlags[field.key] = value
    }
  }
  const payload = { ...base, ...fromFlags }
  if (requireRequired) {
    for (const field of fields) {
      if (field.required && payload[field.key] === undefined) {
        throw new UsageError(`Falta el campo obligatorio ${field.flag} (clave ${field.key})`)
      }
    }
  }
  return payload
}

/** Separa el id posicional inicial del resto de tokens (get/update/delete). */
function takeId(tokens: string[], noun: string, action: string): { id: string; rest: string[] } {
  const [id, ...rest] = tokens
  if (id === undefined || id.startsWith('--')) {
    throw new UsageError(`Falta el id: maurya-cli ${noun} ${action} <id> [flags]`)
  }
  return { id, rest }
}

// ---------------------------------------------------------------------------
// Ayuda
// ---------------------------------------------------------------------------

function fieldHelp(fields: FieldSpec[]): string {
  return fields
    .map((field) => {
      const json = field.kind === 'json' ? ' (JSON)' : ''
      return field.required ? `${field.flag} <valor>${json}` : `[${field.flag} <valor>${json}]`
    })
    .join(' ')
}

function entityHelp(noun: string, spec: EntitySpec): string {
  const lines = [
    `maurya-cli ${noun} create ${fieldHelp(spec.createFields)}`,
    `maurya-cli ${noun} list${spec.listFields.length > 0 ? ` ${fieldHelp(spec.listFields)}` : ''}`,
    `maurya-cli ${noun} get <id>`,
    `maurya-cli ${noun} update <id> ${fieldHelp(spec.updateFields)}`,
    `maurya-cli ${noun} delete <id>`
  ]
  return lines.join('\n')
}

function generalHelp(): string {
  const entityBlocks = Object.entries(ENTITIES)
    .map(([noun, spec]) => entityHelp(noun, spec))
    .join('\n\n')
  return [
    'maurya-cli — CLI de gestión de datos de Maurya (mismo almacén que la app).',
    '',
    'Uso: maurya-cli [--data-dir <dir>] <entidad> <accion> [flags]',
    '',
    'Salida: SIEMPRE un JSON { ok: true, data } | { ok: false, error: { kind, message } }',
    'en stdout, con exit code 0/1. Pensado para integrarse con agentes.',
    '',
    "En create/update, todo comando acepta --json '{...}' con el payload completo",
    '(imprescindible para asignar null o estructuras anidadas); los flags',
    'individuales sobreescriben las claves del --json.',
    '',
    entityBlocks,
    '',
    'maurya-cli search <consulta...>      búsqueda global (discoveries, empresas,',
    '                                     contactos, entrevistas, notas, templates)',
    'maurya-cli status                    estado del almacén y ruta del db.json',
    'maurya-cli <entidad> --help          ayuda de una entidad',
    '',
    'Directorio de datos: --data-dir > $MAURYA_DATA_DIR > userData de la app.',
    'AVISO: si la app Maurya está abierta, su siguiente escritura puede pisar los',
    'cambios hechos por el CLI. Úsalo con la app cerrada (o recárgala después).'
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function printOk(io: CliIo, data: unknown): number {
  io.out(JSON.stringify({ ok: true, data }, null, 2))
  return 0
}

function printError(io: CliIo, kind: string, message: string): number {
  io.out(JSON.stringify({ ok: false, error: { kind, message } }, null, 2))
  return 1
}

/**
 * Ejecuta el CLI sobre `argv` (sin node ni script). Devuelve el exit code.
 * `io` inyectable para tests; la salida de datos va SIEMPRE por io.out.
 */
export function runCli(argv: string[], io: CliIo): number {
  let dataDir: string
  let tokens: string[]
  try {
    const extracted = extractDataDir(argv)
    dataDir = extracted.dataDir
    tokens = extracted.rest
  } catch (error) {
    return printError(io, 'usage', error instanceof Error ? error.message : String(error))
  }

  const [command, ...rest] = tokens

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    io.out(generalHelp())
    return 0
  }

  try {
    if (command === 'status') {
      initStore(dataDir)
      return printOk(io, { ...getStatus(), dataDir, dbFile: join(dataDir, 'db.json') })
    }

    if (command === 'search') {
      const query = rest.join(' ').trim()
      if (query === '') {
        throw new UsageError('Falta la consulta: maurya-cli search <consulta...>')
      }
      initStore(dataDir)
      return printOk(io, searchGlobal(query))
    }

    const spec = ENTITIES[command]
    if (spec === undefined) {
      const known = Object.keys(ENTITIES).join(', ')
      throw new UsageError(`Entidad desconocida: ${command}. Entidades: ${known}, search, status`)
    }

    const [actionToken, ...args] = rest
    if (actionToken === undefined || actionToken === '--help' || actionToken === '-h') {
      io.out(entityHelp(command, spec))
      return 0
    }
    if (!ACTIONS.includes(actionToken as Action)) {
      throw new UsageError(`Acción desconocida: ${actionToken}. Acciones: ${ACTIONS.join(', ')}`)
    }
    const action = actionToken as Action

    initStore(dataDir)

    switch (action) {
      case 'create':
        return printOk(io, spec.create(parsePayload(args, spec.createFields, true)))
      case 'list':
        return printOk(io, spec.list(parsePayload(args, spec.listFields, true)))
      case 'get': {
        const { id } = takeId(args, command, action)
        return printOk(io, spec.get(id))
      }
      case 'update': {
        const { id, rest: patchTokens } = takeId(args, command, action)
        return printOk(io, spec.update(id, parsePayload(patchTokens, spec.updateFields, false)))
      }
      case 'delete': {
        const { id } = takeId(args, command, action)
        return printOk(io, spec.remove(id))
      }
    }
  } catch (error) {
    if (error instanceof UsageError) {
      return printError(io, 'usage', error.message)
    }
    const dbError = toDbError(error)
    return printError(io, dbError.kind, dbError.message)
  }
}
