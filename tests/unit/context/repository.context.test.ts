// @vitest-environment node
/**
 * Campo `context` de empresas y contactos + singleton linkedinMcpSettings —
 * capa de persistencia. Store JSON REAL en directorio temporal (patrón
 * persistence, espejo de repository.assistantSettings.test.ts).
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DbOperationError } from '../../../src/main/db/errors'
import {
  createCompany,
  createContact,
  getCompany,
  getContact,
  getLinkedinMcpSettings,
  setLinkedinMcpSettings,
  updateCompany,
  updateContact
} from '../../../src/main/db/repository'
import { initStore, type DbData } from '../../../src/main/db/store'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  }
}))

let baseDir = ''
let dbPath = ''

function readDbFile(): DbData & { linkedinMcpSettings?: unknown } {
  return JSON.parse(readFileSync(dbPath, 'utf-8')) as DbData & { linkedinMcpSettings?: unknown }
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'maurya-context-db-'))
  dbPath = join(baseDir, 'db.json')
  initStore(baseDir)
})

describe('repository (campo context de empresas y contactos)', () => {
  it('creates companies with context null by default and persists the provided context', () => {
    const bare = createCompany({ name: 'Acme' })
    expect(bare.context).toBeNull()

    const withContext = createCompany({
      name: 'Globex',
      context: 'Fabrican humo con propósito'
    })
    expect(withContext.context).toBe('Fabrican humo con propósito')
    expect(getCompany(withContext.id).context).toBe('Fabrican humo con propósito')
  })

  it('updates and clears the company context via patch without touching other fields', () => {
    const company = createCompany({
      name: 'Acme',
      website: 'https://acme.test'
    })

    const updated = updateCompany(company.id, { context: 'Contexto generado' })
    expect(updated.context).toBe('Contexto generado')
    expect(updated.website).toBe('https://acme.test')
    expect(updated.name).toBe('Acme')

    // Un patch sin context no lo pisa
    expect(updateCompany(company.id, { name: 'Acme Corp' }).context).toBe('Contexto generado')

    // null limpia el campo
    expect(updateCompany(company.id, { context: null }).context).toBeNull()
  })

  it('creates and updates the contact context with the same semantics', () => {
    const company = createCompany({ name: 'Acme' })
    const contact = createContact({ companyId: company.id, name: 'Ada' })
    expect(contact.context).toBeNull()

    const updated = updateContact(contact.id, { context: 'CTO, decide compras' })
    expect(updated.context).toBe('CTO, decide compras')
    expect(getContact(contact.id).context).toBe('CTO, decide compras')

    // Un patch sin context no lo pisa; null limpia
    expect(updateContact(contact.id, { position: 'CTO' }).context).toBe('CTO, decide compras')
    expect(updateContact(contact.id, { context: null }).context).toBeNull()
  })

  it('keeps legacy records without the field readable (context undefined tolerated)', () => {
    const company = createCompany({ name: 'Acme' })
    // Simula un registro anterior a la feature: sin la propiedad context
    const raw = readDbFile()
    raw.companies = raw.companies.map((entry) =>
      entry.id === company.id
        ? (Object.fromEntries(
            Object.entries(entry).filter(([key]) => key !== 'context')
          ) as typeof entry)
        : entry
    )
    writeFileSync(dbPath, JSON.stringify(raw))
    initStore(baseDir)

    expect(getCompany(company.id).context).toBeUndefined()
    // Y sigue siendo actualizable
    expect(updateCompany(company.id, { context: 'nuevo' }).context).toBe('nuevo')
  })
})

describe('repository (linkedinMcpSettings)', () => {
  it('defaults to not configured, persists a valid URL and clears it back to null', () => {
    expect(getLinkedinMcpSettings()).toEqual({ url: null })

    expect(setLinkedinMcpSettings({ url: 'https://mcp.apify.com' })).toEqual({
      url: 'https://mcp.apify.com'
    })
    expect(getLinkedinMcpSettings()).toEqual({ url: 'https://mcp.apify.com' })
    expect(readDbFile().linkedinMcpSettings).toEqual({ url: 'https://mcp.apify.com' })

    // El trim se aplica y el vacío desconfigura
    expect(setLinkedinMcpSettings({ url: '  ' })).toEqual({ url: null })
    expect(getLinkedinMcpSettings()).toEqual({ url: null })
  })

  it('rejects non-http(s) URLs with a validation error persisting nothing', () => {
    for (const invalid of ['apify.com', 'ftp://mcp.apify.com', 'http://', 'https://con espacios']) {
      let caught: unknown = null
      try {
        setLinkedinMcpSettings({ url: invalid })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(DbOperationError)
      expect((caught as DbOperationError).kind).toBe('validation')
    }
    expect(readDbFile().linkedinMcpSettings).toBeUndefined()
  })

  it('normalizes a corrupt persisted setting to not-configured without crashing', () => {
    const base = readDbFile()
    for (const corrupt of ['garbage', { url: 42 }, { url: 'no-es-url' }, 7]) {
      writeFileSync(dbPath, JSON.stringify({ ...base, linkedinMcpSettings: corrupt }))
      expect(() => initStore(baseDir)).not.toThrow()
      expect(getLinkedinMcpSettings()).toEqual({ url: null })
    }
  })
})
