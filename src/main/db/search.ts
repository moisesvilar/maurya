import type {
  SearchCompanyHit,
  SearchContactHit,
  SearchDiscoveryHit,
  SearchGroupHit,
  SearchInterviewHit,
  SearchResults
} from '../../renderer/src/types/search'
import type { Company } from '../../renderer/src/types/domain'
import { read } from './store'

/** Máximo de resultados por grupo (regla de densidad 8.2 de la spec). */
const GROUP_LIMIT = 8

/**
 * Normalización para la coincidencia: minúsculas + eliminación de diacríticos
 * vía NFD (los combining marks U+0300–U+036F se descartan). Se aplica a ambos
 * lados para que "acme" encuentre "Acmé" (AC de case/diacríticos-insensitive).
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function emptyResults(): SearchResults {
  return { discoveries: [], groups: [], companies: [], contacts: [], interviews: [] }
}

/**
 * Búsqueda global (SPEC-018, adaptada al modelo v3 en SPEC-048): coincidencia
 * por subcadena normalizada sobre nombre de discovery, nombre de grupo de
 * entrevistas, nombre de empresa, nombre de contacto y título de entrevista,
 * en un único read del snapshot. El contexto (discovery del grupo, empresa
 * del contacto/entrevista) se resuelve con Maps O(1); si una referencia no
 * resuelve (dato inconsistente) el hit se omite en vez de romper — las
 * empresas, ya globales, no se omiten nunca. Query vacía o en blanco →
 * grupos vacíos (el estado inicial lo gestiona la UI sin llamar). Límite de
 * 8 por grupo en orden de inserción.
 */
export function searchGlobal(query: string): SearchResults {
  const normalizedQuery = normalizeSearchText(query.trim())
  if (normalizedQuery === '') {
    return emptyResults()
  }

  return read((store) => {
    const matches = (text: string): boolean => normalizeSearchText(text).includes(normalizedQuery)

    const companiesById = new Map<string, Company>(
      store.companies.map((company) => [company.id, company])
    )

    const discoveries: SearchDiscoveryHit[] = []
    for (const discovery of store.discoveries) {
      if (discoveries.length >= GROUP_LIMIT) {
        break
      }
      if (matches(discovery.name)) {
        discoveries.push({ id: discovery.id, name: discovery.name })
      }
    }

    // SPEC-048: grupos de entrevistas por nombre, con el nombre de su
    // discovery como contexto; un discovery irresoluble (dato inconsistente)
    // omite el hit en vez de romper.
    const discoveryNameById = new Map<string, string>(
      store.discoveries.map((discovery) => [discovery.id, discovery.name])
    )
    const groups: SearchGroupHit[] = []
    for (const group of store.interviewGroups) {
      if (groups.length >= GROUP_LIMIT) {
        break
      }
      if (!matches(group.name)) {
        continue
      }
      const discoveryName = discoveryNameById.get(group.discoveryId)
      if (discoveryName === undefined) {
        continue
      }
      groups.push({
        id: group.id,
        discoveryId: group.discoveryId,
        name: group.name,
        discoveryName
      })
    }

    // SPEC-048: las empresas son globales — toda coincidencia entra, sin
    // depender de discoveries (deroga el ancla transicional de SPEC-043).
    const companies: SearchCompanyHit[] = []
    for (const company of store.companies) {
      if (companies.length >= GROUP_LIMIT) {
        break
      }
      if (matches(company.name)) {
        companies.push({ id: company.id, name: company.name })
      }
    }

    const contacts: SearchContactHit[] = []
    for (const contact of store.contacts) {
      if (contacts.length >= GROUP_LIMIT) {
        break
      }
      if (!matches(contact.name)) {
        continue
      }
      const company = companiesById.get(contact.companyId)
      if (company === undefined) {
        continue
      }
      contacts.push({
        id: contact.id,
        name: contact.name,
        companyId: company.id,
        companyName: company.name
      })
    }

    const interviews: SearchInterviewHit[] = []
    for (const interview of store.interviews) {
      if (interviews.length >= GROUP_LIMIT) {
        break
      }
      if (!matches(interview.title)) {
        continue
      }
      // SPEC-020: las capturas sin empresa también son hits (companyId /
      // companyName null); solo se mantiene la omisión defensiva cuando un
      // companyId no-null no resuelve (dato inconsistente).
      let company: Company | undefined
      if (interview.companyId !== null) {
        company = companiesById.get(interview.companyId)
        if (company === undefined) {
          continue
        }
      }
      interviews.push({
        id: interview.id,
        title: interview.title,
        companyId: company?.id ?? null,
        discoveryId: interview.discoveryId,
        companyName: company?.name ?? null,
        status: interview.status
      })
    }

    return { discoveries, groups, companies, contacts, interviews }
  })
}
