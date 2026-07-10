// @vitest-environment node
/**
 * Tests del repositorio de dominio (SPEC-006) contra el store JSON real en un
 * directorio temporal (initStore(baseDir) inyectable, patrón wavFileService).
 * Electron se mockea con un guard que lanza: si algún camino usara
 * app.getPath en vez del baseDir inyectado, el test lo delataría.
 */
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DbOperationError } from '../../../src/main/db/errors'
import {
  createCompany,
  createContact,
  createDiscovery,
  createInterview,
  createInterviewTemplate,
  createNote,
  createNoteTemplate,
  deleteDiscovery,
  deleteInterview,
  deleteInterviewTemplate,
  getDiscovery,
  getInterview,
  getInterviewTemplate,
  getNoteByInterview,
  getNoteTemplate,
  listCompanies,
  listContacts,
  listDiscoveries,
  updateDiscovery
} from '../../../src/main/db/repository'
import { initStore, type DbData } from '../../../src/main/db/store'
import type { DbErrorKind, TemplateBlock } from '../../../src/renderer/src/types/domain'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  }
}))

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/

let baseDir = ''
let dbPath = ''

function readDbFile(): DbData {
  return JSON.parse(readFileSync(dbPath, 'utf-8')) as DbData
}

/** Captura el error tipado de una operación que debe fallar. */
function expectDbError(fn: () => unknown, kind: DbErrorKind): DbOperationError {
  let caught: unknown = null
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(DbOperationError)
  const dbError = caught as DbOperationError
  expect(dbError.kind).toBe(kind)
  return dbError
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'maurya-db-'))
  dbPath = join(baseDir, 'db.json')
  initStore(baseDir)
})

describe('repository', () => {
  describe('entity CRUD happy path', () => {
    // SPEC-006 · AC-01
    it('creates a discovery returning the entity with generated id and populated createdAt/updatedAt', () => {
      const discovery = createDiscovery({ name: 'Discovery Maurya' })
      expect(discovery.name).toBe('Discovery Maurya')
      expect(discovery.id).toMatch(UUID_V4)
      expect(discovery.createdAt).toMatch(ISO_8601)
      expect(discovery.updatedAt).toMatch(ISO_8601)
      expect(listDiscoveries()).toEqual([discovery])
    })

    // SPEC-006 · AC-02
    it('creates a company under a discovery and lists it among the discovery companies', () => {
      const discovery = createDiscovery({ name: 'Discovery Maurya' })
      const company = createCompany({
        discoveryId: discovery.id,
        name: 'Acme Corp',
        website: 'https://acme.example',
        linkedinUrl: 'https://linkedin.com/company/acme'
      })
      expect(company.discoveryId).toBe(discovery.id)
      expect(company.website).toBe('https://acme.example')
      expect(company.linkedinUrl).toBe('https://linkedin.com/company/acme')
      expect(listCompanies(discovery.id)).toEqual([company])
    })

    // SPEC-006 · AC-03
    it('creates a contact associated to its company', () => {
      const discovery = createDiscovery({ name: 'Discovery Maurya' })
      const company = createCompany({ discoveryId: discovery.id, name: 'Acme Corp' })
      const contact = createContact({
        companyId: company.id,
        name: 'Jane Doe',
        position: 'CTO',
        linkedinUrl: 'https://linkedin.com/in/janedoe'
      })
      expect(contact.companyId).toBe(company.id)
      expect(contact.position).toBe('CTO')
      expect(contact.linkedinUrl).toBe('https://linkedin.com/in/janedoe')
      expect(listContacts(company.id)).toEqual([contact])
    })

    // SPEC-006 · AC-04
    it('persists an interview template with two blocks and ordered questions and reads back the exact order and content', () => {
      const blocks: TemplateBlock[] = [
        {
          title: 'Contexto',
          guidance: 'Romper el hielo',
          questions: [
            { text: '¿A qué te dedicas?', guidance: 'Abierta' },
            { text: '¿Cómo es tu día a día?' }
          ]
        },
        {
          title: 'Problema',
          questions: [
            { text: '¿Cuál es tu mayor fricción?' },
            { text: '¿Qué has probado ya?', guidance: 'Buscar workarounds' },
            { text: '¿Cuánto te cuesta?' }
          ]
        }
      ]
      const template = createInterviewTemplate({
        name: 'Guión exploratorio',
        phase: 'exploratory',
        blocks
      })

      // Relectura completa: mismo orden y contenido exactos de bloques y preguntas
      const reread = getInterviewTemplate(template.id)
      expect(reread.blocks).toEqual(blocks)
      expect(reread.phase).toBe('exploratory')
      // ...y en el archivo persistido (orden de arrays = orden canónico)
      expect(readDbFile().interviewTemplates[0].blocks).toEqual(blocks)
    })

    // SPEC-006 · AC-05
    it('creates an interview in draft status with correct contact and template references', () => {
      const discovery = createDiscovery({ name: 'Discovery Maurya' })
      const company = createCompany({ discoveryId: discovery.id, name: 'Acme Corp' })
      const contact = createContact({ companyId: company.id, name: 'Jane Doe' })
      const template = createInterviewTemplate({ name: 'Guión exploratorio' })

      const interview = createInterview({
        discoveryId: discovery.id,
        companyId: company.id,
        title: 'Entrevista con Jane',
        contactId: contact.id,
        templateId: template.id
      })
      expect(interview.status).toBe('draft')
      // SPEC-020 (schema v2): la entrevista ancla su discovery directamente
      expect(interview.discoveryId).toBe(discovery.id)
      expect(interview.companyId).toBe(company.id)
      expect(interview.contactId).toBe(contact.id)
      expect(interview.templateId).toBe(template.id)
      // Opcionales aún sin valor: null explícito, no undefined
      expect(interview.scriptMarkdown).toBeNull()
      expect(interview.objectives).toEqual([])
      expect(interview.wavPath).toBeNull()
      expect(interview.transcriptPath).toBeNull()
    })

    // SPEC-006 · AC-06
    it('persists a note template with context and sections and reads it back identical', () => {
      const template = createNoteTemplate({
        name: 'Notas de entrevista',
        context: 'Contexto largo del producto: discovery B2B de Maurya para entrevistas.',
        sections: [
          { title: 'Dolores', description: 'Problemas detectados en la conversación' },
          { title: 'Citas', description: 'Frases literales relevantes' }
        ]
      })
      expect(getNoteTemplate(template.id)).toEqual(template)
      expect(readDbFile().noteTemplates[0]).toEqual(template)
    })

    // SPEC-006 · AC-07
    it('updates a field changing updatedAt strictly forward and reading back the new value', () => {
      const discovery = createDiscovery({ name: 'Nombre original' })
      const updated = updateDiscovery(discovery.id, { name: 'Nombre nuevo' })
      expect(updated.name).toBe('Nombre nuevo')
      // updatedAt estrictamente creciente (comparación de strings ISO)
      expect(updated.updatedAt > discovery.updatedAt).toBe(true)
      expect(getDiscovery(discovery.id).name).toBe('Nombre nuevo')
      expect(readDbFile().discoveries[0].name).toBe('Nombre nuevo')
    })
  })

  describe('validation', () => {
    // SPEC-006 · AC-09
    it('rejects empty or whitespace-only names with a validation error without persisting anything', () => {
      expectDbError(() => createDiscovery({ name: '' }), 'validation')
      expectDbError(() => createDiscovery({ name: '   ' }), 'validation')
      expectDbError(() => createCompany({ discoveryId: 'no-importa', name: '  ' }), 'validation')
      expectDbError(() => createContact({ companyId: 'no-importa', name: '' }), 'validation')
      expectDbError(() => createInterviewTemplate({ name: '\t ' }), 'validation')
      expectDbError(() => createNoteTemplate({ name: '' }), 'validation')

      // No persiste nada: el archivo no tiene rastro de ninguna entidad
      const persisted = readDbFile()
      expect(persisted.discoveries).toEqual([])
      expect(persisted.companies).toEqual([])
      expect(persisted.contacts).toEqual([])
      expect(persisted.interviewTemplates).toEqual([])
      expect(persisted.noteTemplates).toEqual([])
    })

    // SPEC-006 · AC-10
    it('rejects a company creation with a nonexistent discoveryId with a reference error without persisting anything', () => {
      expectDbError(
        () => createCompany({ discoveryId: 'discovery-inexistente', name: 'Acme Corp' }),
        'reference'
      )
      expect(readDbFile().companies).toEqual([])
    })
  })

  describe('referential integrity and deletion', () => {
    // SPEC-006 · AC-11
    it('deletes a discovery cascading to its companies, contacts, interviews and notes while global templates survive', () => {
      const discovery = createDiscovery({ name: 'Discovery Maurya' })
      const companyA = createCompany({ discoveryId: discovery.id, name: 'Acme Corp' })
      const companyB = createCompany({ discoveryId: discovery.id, name: 'Globex' })
      const contact = createContact({ companyId: companyA.id, name: 'Jane Doe' })
      const interviewTemplate = createInterviewTemplate({ name: 'Guión exploratorio' })
      const noteTemplate = createNoteTemplate({ name: 'Notas de entrevista' })
      const interviewA = createInterview({
        discoveryId: discovery.id,
        companyId: companyA.id,
        title: 'Entrevista A',
        contactId: contact.id,
        templateId: interviewTemplate.id
      })
      createInterview({ discoveryId: discovery.id, companyId: companyB.id, title: 'Entrevista B' })
      createNote({ interviewId: interviewA.id, contentMarkdown: '# Notas' })

      deleteDiscovery(discovery.id)

      const persisted = readDbFile()
      expect(persisted.discoveries).toEqual([])
      expect(persisted.companies).toEqual([])
      expect(persisted.contacts).toEqual([])
      expect(persisted.interviews).toEqual([])
      expect(persisted.notes).toEqual([])
      // Los templates son globales: la cascada no los toca
      expect(persisted.interviewTemplates).toEqual([interviewTemplate])
      expect(persisted.noteTemplates).toEqual([noteTemplate])
    })

    // SPEC-006 · AC-12
    it('deletes a referenced interview template leaving the interview alive with templateId set to null', () => {
      const discovery = createDiscovery({ name: 'Discovery Maurya' })
      const company = createCompany({ discoveryId: discovery.id, name: 'Acme Corp' })
      const template = createInterviewTemplate({ name: 'Guión exploratorio' })
      const interview = createInterview({
        discoveryId: discovery.id,
        companyId: company.id,
        title: 'Entrevista con template',
        templateId: template.id
      })

      deleteInterviewTemplate(template.id)

      const survivor = getInterview(interview.id)
      expect(survivor.templateId).toBeNull()
      expect(survivor.title).toBe('Entrevista con template')
      expect(readDbFile().interviewTemplates).toEqual([])
    })

    // SPEC-006 · AC-13
    it('deletes an interview removing its note as well', () => {
      const discovery = createDiscovery({ name: 'Discovery Maurya' })
      const company = createCompany({ discoveryId: discovery.id, name: 'Acme Corp' })
      const interview = createInterview({
        discoveryId: discovery.id,
        companyId: company.id,
        title: 'Entrevista con nota'
      })
      createNote({ interviewId: interview.id, contentMarkdown: '# Notas de la sesión' })
      expect(getNoteByInterview(interview.id)).not.toBeNull()

      deleteInterview(interview.id)

      expect(getNoteByInterview(interview.id)).toBeNull()
      const persisted = readDbFile()
      expect(persisted.interviews).toEqual([])
      expect(persisted.notes).toEqual([])
    })
  })

  describe('empty state', () => {
    // SPEC-006 · AC-14
    it('lists discoveries as an empty array (not an error) on a freshly initialized store', () => {
      expect(listDiscoveries()).toEqual([])
    })
  })

  describe('edge cases', () => {
    // SPEC-006 · AC-16
    it('persists both of two chained writes with no loss when re-reading the file', () => {
      const first = createDiscovery({ name: 'Primera escritura' })
      const second = createDiscovery({ name: 'Segunda escritura' })

      const persisted = readDbFile()
      expect(persisted.discoveries).toHaveLength(2)
      expect(persisted.discoveries[0]).toEqual(first)
      expect(persisted.discoveries[1]).toEqual(second)
    })

    // SPEC-006 · AC-17
    it('recovers names with emoji, special characters and 500-char length identical after a disk round-trip', () => {
      const specialName = ('🎙️📝 Discovery «année» ñÑ€ — ' + 'ü'.repeat(500)).slice(0, 500)
      expect(specialName.length).toBe(500)
      const discovery = createDiscovery({ name: specialName })

      // Relectura real desde disco: re-init del store sobre el mismo baseDir
      initStore(baseDir)
      expect(getDiscovery(discovery.id).name).toBe(specialName)
    })
  })
})
