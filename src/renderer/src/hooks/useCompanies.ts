import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Company } from '@/types/domain'

/** Estado de la sección Empresas del detalle de discovery (SPEC-011). */
export type CompaniesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; companies: Company[] }

/** Valores del formulario de empresa ya normalizados ('' → null, SPEC-006). */
export interface CompanyFormValues {
  name: string
  website: string | null
  linkedinUrl: string | null
  context: string | null
}

export interface UseCompaniesResult {
  state: CompaniesState
  /** Crea una empresa; devuelve true si se creó (para cerrar el Dialog). */
  createCompany: (values: CompanyFormValues) => Promise<boolean>
  /** Edita una empresa (patch completo: null limpia); true si se guardó. */
  updateCompany: (id: string, values: CompanyFormValues) => Promise<boolean>
  /** Elimina una empresa (cascada contactos+entrevistas en main, SPEC-006). */
  removeCompany: (id: string) => Promise<void>
}

/** Orden del listado: por fecha de alta ascendente (ISO comparable). */
function sortByCreatedAtAsc(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Empresas GLOBALES (SPEC-043 transicional: la página bajo el discovery lista
 * TODAS las del sistema y el alta ya no envía discoveryId; la sección Empresas
 * propia llega en H11.2). Persistencia exclusiva vía `api.db.*Company`
 * (SPEC-006): las promesas nunca se rechazan, los fallos viajan como
 * `{ ok: false, error }` y se mapean a error state (listar) o Toast
 * destructive (mutaciones, sin tocar el estado). Orden por `createdAt` asc;
 * la edición no re-ordena (mantiene el orden de alta).
 */
export function useCompanies(): UseCompaniesResult {
  const [state, setState] = useState<CompaniesState>({ status: 'loading' })

  // El estado inicial ya es loading, así el efecto de montaje no hace setState
  // síncrono (react-hooks/set-state-in-effect); los setState viven en el
  // callback de la promesa (patrón useDiscoveries).
  useEffect(() => {
    void window.api.db.listCompanies().then((result) => {
      if (result.ok) {
        setState({ status: 'ready', companies: sortByCreatedAtAsc(result.data) })
      } else {
        setState({ status: 'error', message: result.error.message })
      }
    })
  }, [])

  const createCompany = useCallback(async (values: CompanyFormValues): Promise<boolean> => {
    const result = await window.api.db.createCompany(values)
    if (!result.ok) {
      toast.error(result.error.message)
      return false
    }
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', companies: [...prev.companies, result.data] }
        : prev
    )
    toast('Empresa creada')
    return true
  }, [])

  const updateCompany = useCallback(
    async (id: string, values: CompanyFormValues): Promise<boolean> => {
      const result = await window.api.db.updateCompany(id, values)
      if (!result.ok) {
        toast.error(result.error.message)
        return false
      }
      setState((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              companies: prev.companies.map((company) =>
                company.id === id ? result.data : company
              )
            }
          : prev
      )
      toast('Cambios guardados')
      return true
    },
    []
  )

  const removeCompany = useCallback(async (id: string): Promise<void> => {
    const result = await window.api.db.deleteCompany(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', companies: prev.companies.filter((company) => company.id !== id) }
        : prev
    )
    toast('Empresa eliminada')
  }, [])

  return { state, createCompany, updateCompany, removeCompany }
}
