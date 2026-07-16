/**
 * Tipos del flujo capture-first (SPEC-020). Este módulo NO debe depender del
 * DOM: lo importan (type-only) main y preload. El listado global de capturas
 * viaja con el contexto ya resuelto en main (patrón search.ts) para que la UI
 * no haga N llamadas; la asignación de empresa/contacto es una operación
 * compuesta única (crear-empresa/crear-contacto/actualizar-entrevista) que el
 * store garantiza atómica: si algo lanza, cero escrituras.
 */

import type { Company, Contact, Interview } from './domain'

/**
 * Fila del listado global de capturas: la entrevista más los nombres de sus
 * referencias resueltos en main. Referencias ausentes o irresolubles → null
 * (defensivo: el listado nunca rompe por un dato inconsistente). SPEC-043:
 * `contactNames` lleva los nombres de TODOS los contactos en el orden de
 * `contactIds`; los ids irresolubles se omiten.
 */
export interface CaptureListItem {
  interview: Interview
  discoveryName: string
  companyName: string | null
  contactNames: string[]
  templateName: string | null
}

/** Datos de la empresa creada inline desde el Sheet de asignación. */
export interface AssignNewCompanyInput {
  name: string
  website?: string | null
  linkedinUrl?: string | null
}

/** Datos del contacto creado inline desde el Sheet de asignación. */
export interface AssignNewContactInput {
  name: string
  position?: string | null
  linkedinUrl?: string | null
}

/**
 * Input de la asignación (SPEC-020): exactamente UNO de `companyId` (SPEC-043:
 * cualquier empresa existente del SISTEMA, ya no solo del discovery de la
 * captura) o `newCompany` (creación inline de una empresa GLOBAL). Contacto
 * opcional: `contactId` (existente de esa empresa, o null para "Sin
 * contacto"), `newContact` (creación inline), o nada. La entrevista resultante
 * lleva `contactIds` = [contacto] o [].
 */
export interface AssignCompanyInput {
  companyId?: string
  newCompany?: AssignNewCompanyInput
  contactId?: string | null
  newContact?: AssignNewContactInput
}

/**
 * Resultado de la asignación: entidades finales para que la UI refresque
 * cabecera/fila sin recargar.
 */
export interface AssignCompanyResult {
  interview: Interview
  company: Company
  contact: Contact | null
}
