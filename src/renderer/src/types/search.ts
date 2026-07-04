/**
 * Tipos de la búsqueda global (SPEC-018). Este módulo NO debe depender del
 * DOM: lo importan (type-only) main y preload. La búsqueda corre íntegra en
 * main (canal `db:search`); por aquí viajan la query y los resultados
 * agrupados con el contexto ya resuelto para que la UI no tenga que hacer
 * lookups adicionales.
 */

import type { InterviewStatus } from './domain'

/** Coincidencia de un discovery por nombre. */
export interface SearchDiscoveryHit {
  id: string
  name: string
}

/** Coincidencia de una empresa por nombre, con su discovery como contexto. */
export interface SearchCompanyHit {
  id: string
  discoveryId: string
  name: string
  discoveryName: string
}

/**
 * Coincidencia de un contacto por nombre. El destino de navegación es el
 * detalle de su empresa, por eso viajan companyId + companyDiscoveryId.
 */
export interface SearchContactHit {
  id: string
  name: string
  companyId: string
  companyDiscoveryId: string
  companyName: string
}

/** Coincidencia de una entrevista por título, con empresa y estado como contexto. */
export interface SearchInterviewHit {
  id: string
  title: string
  companyId: string
  discoveryId: string
  companyName: string
  status: InterviewStatus
}

/**
 * Resultados agrupados por tipo (máx. 8 por grupo, aplicado en main). Query
 * vacía o en blanco → todos los grupos vacíos.
 */
export interface SearchResults {
  discoveries: SearchDiscoveryHit[]
  companies: SearchCompanyHit[]
  contacts: SearchContactHit[]
  interviews: SearchInterviewHit[]
}
