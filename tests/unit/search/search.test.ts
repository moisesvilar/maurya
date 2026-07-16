// @vitest-environment node
/**
 * Tests de src/main/db/search.ts (SPEC-018) contra el store REAL inyectado
 * (patrón tests/unit/persistence): normalización, subcadena, contexto
 * resuelto, límite por grupo y query en blanco.
 * Adaptado por SPEC-048 (modelo v3): hits de empresa { id, name } y de
 * contacto sin companyDiscoveryId (destinos globales /companies/:id) y
 * `groups` en SearchResults. El índice de grupos se testea en search.v3.test.ts.
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as repository from '../../../src/main/db/repository'
import { normalizeSearchText, searchGlobal } from '../../../src/main/db/search'
import { initStore } from '../../../src/main/db/store'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  }
}))

// SPEC-048: SearchResults gana `groups` (grupos de entrevistas) también en
// la respuesta vacía
const EMPTY_RESULTS = { discoveries: [], groups: [], companies: [], contacts: [], interviews: [] }

beforeEach(() => {
  initStore(mkdtempSync(join(tmpdir(), 'maurya-search-')))
})

describe('searchGlobal', () => {
  describe('normalization', () => {
    // SPEC-018 · AC-10 (insensible a mayúsculas y diacríticos)
    it('matches names regardless of case and diacritics in both directions', () => {
      expect(normalizeSearchText('Ácmé CÓRP')).toBe('acme corp')

      // SPEC-043/048: las empresas son globales (createCompany sin discovery);
      // desde SPEC-048 su hit ya no depende de ningún discovery
      repository.createDiscovery({ name: 'Vertical Sanidad' })
      repository.createCompany({ name: 'Acmé Córp' })

      // Query sin acentos encuentra el nombre acentuado…
      expect(searchGlobal('acme corp').companies).toHaveLength(1)
      // …y la query acentuada/mayúscula encuentra igualmente
      expect(searchGlobal('ÁCMÉ').companies).toHaveLength(1)
      expect(searchGlobal('acmé córp').companies[0].name).toBe('Acmé Córp')
    })
  })

  describe('substring matching with resolved context', () => {
    // SPEC-018 · refuerzo de AC-05..AC-08 (capa main: hits con contexto resuelto)
    it('matches by substring on each entity type returning the nested navigation context', () => {
      const discovery = repository.createDiscovery({ name: 'Vertical Sanidad' })
      // SPEC-043/048: empresa global; su hit viaja sin referencia a discovery
      const company = repository.createCompany({ name: 'Acmé Córp' })
      const contact = repository.createContact({ companyId: company.id, name: 'María López' })
      const interview = repository.createInterview({
        discoveryId: discovery.id,
        companyId: company.id,
        title: 'Entrevista de dolor con María'
      })

      // Discovery por subcadena del nombre
      expect(searchGlobal('sanid').discoveries).toEqual([
        { id: discovery.id, name: 'Vertical Sanidad' }
      ])
      // Empresa (SPEC-048, deroga el ancla transicional de SPEC-043): el hit
      // es global — { id, name } sin ninguna referencia a discovery; su
      // destino de navegación es /companies/:id
      expect(searchGlobal('corp').companies).toEqual([
        {
          id: company.id,
          name: 'Acmé Córp'
        }
      ])
      // Contacto con su empresa como contexto y companyId para navegar al
      // detalle global /companies/:companyId (SPEC-048: sin companyDiscoveryId)
      expect(searchGlobal('maría lópez').contacts).toEqual([
        {
          id: contact.id,
          name: 'María López',
          companyId: company.id,
          companyName: 'Acmé Córp'
        }
      ])
      // Entrevista con empresa, ids anidados y estado
      expect(searchGlobal('dolor').interviews).toEqual([
        {
          id: interview.id,
          title: 'Entrevista de dolor con María',
          companyId: company.id,
          discoveryId: discovery.id,
          companyName: 'Acmé Córp',
          status: 'draft'
        }
      ])
    })
  })

  describe('group limit', () => {
    // SPEC-018 · AC-11 (máximo 8 resultados por grupo)
    it('caps each group at 8 results', () => {
      // SPEC-043/048: empresas globales, sin dependencia de discoveries
      repository.createDiscovery({ name: 'Discovery base' })
      for (let index = 1; index <= 10; index += 1) {
        repository.createCompany({ name: `Empresa ${index}` })
      }

      const results = searchGlobal('empresa')
      expect(results.companies).toHaveLength(8)
      expect(results.companies[0].name).toBe('Empresa 1')
      expect(results.companies[7].name).toBe('Empresa 8')
    })
  })

  describe('blank query', () => {
    // SPEC-018 · refuerzo de AC-17 (query vacía o en blanco → grupos vacíos)
    it('returns empty groups for empty or whitespace-only queries', () => {
      repository.createDiscovery({ name: 'Discovery base' })
      repository.createCompany({ name: 'Acme Corp' })

      expect(searchGlobal('')).toEqual(EMPTY_RESULTS)
      expect(searchGlobal('   ')).toEqual(EMPTY_RESULTS)
    })
  })
})
