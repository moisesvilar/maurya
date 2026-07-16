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

/**
 * Coincidencia de un grupo de entrevistas por nombre (SPEC-048). El destino
 * de navegación es `/discoveries/:discoveryId/groups/:id`; `discoveryName`
 * es el contexto muted de la fila, resuelto en main con Map O(1).
 */
export interface SearchGroupHit {
  id: string
  discoveryId: string
  name: string
  discoveryName: string
}

/**
 * Coincidencia de una empresa por nombre. SPEC-048: las empresas son globales
 * y su destino de navegación es el detalle global directo `/companies/:id`
 * (desaparece el ancla transicional de SPEC-043).
 */
export interface SearchCompanyHit {
  id: string
  name: string
}

/**
 * Coincidencia de un contacto por nombre. El destino de navegación es el
 * detalle global de su empresa (`/companies/:companyId`, SPEC-048), por eso
 * viaja companyId; companyName es el contexto mostrado en la fila.
 */
export interface SearchContactHit {
  id: string
  name: string
  companyId: string
  companyName: string
}

/**
 * Coincidencia de una entrevista por título, con empresa y estado como
 * contexto. SPEC-020: `companyId`/`companyName` son null en capturas sin
 * empresa — su destino de navegación pasa a ser `/captures/:id` y el contexto
 * mostrado "Sin empresa". `discoveryId` se resuelve desde la propia entrevista.
 */
export interface SearchInterviewHit {
  id: string
  title: string
  companyId: string | null
  discoveryId: string
  companyName: string | null
  status: InterviewStatus
}

/**
 * Resultados agrupados por tipo (máx. 8 por grupo, aplicado en main). Query
 * vacía o en blanco → todos los grupos vacíos.
 */
export interface SearchResults {
  discoveries: SearchDiscoveryHit[]
  groups: SearchGroupHit[]
  companies: SearchCompanyHit[]
  contacts: SearchContactHit[]
  interviews: SearchInterviewHit[]
}
