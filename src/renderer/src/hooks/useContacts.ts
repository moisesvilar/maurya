import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Contact } from '@/types/domain'

/** Estado de la sección Contactos del detalle de empresa (SPEC-011). */
export type ContactsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; contacts: Contact[] }

/** Valores del formulario de contacto ya normalizados ('' → null, SPEC-006). */
export interface ContactFormValues {
  name: string
  position: string | null
  linkedinUrl: string | null
  context: string | null
}

export interface UseContactsResult {
  state: ContactsState
  /** Crea un contacto; devuelve true si se creó (para cerrar el Dialog). */
  createContact: (values: ContactFormValues) => Promise<boolean>
  /** Edita un contacto (patch completo: null limpia); true si se guardó. */
  updateContact: (id: string, values: ContactFormValues) => Promise<boolean>
  /** Elimina un contacto (sin cascada: mensaje simple). */
  removeContact: (id: string) => Promise<void>
  /** Genera el contexto del contacto desde LinkedIn (vía MCP) y refresca la fila. */
  generateContext: (id: string) => Promise<void>
}

/** Orden del listado: por fecha de alta ascendente (ISO comparable). */
function sortByCreatedAtAsc(contacts: Contact[]): Contact[] {
  return [...contacts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Contactos de una empresa (SPEC-011). Persistencia exclusiva vía
 * `api.db.*Contact` (SPEC-006): las promesas nunca se rechazan, los fallos
 * viajan como `{ ok: false, error }` y se mapean a error state (listar) o
 * Toast destructive (mutaciones, sin tocar el estado). Orden por `createdAt`
 * asc; la edición no re-ordena (mantiene el orden de alta).
 */
export function useContacts(companyId: string): UseContactsResult {
  const [state, setState] = useState<ContactsState>({ status: 'loading' })

  // El estado inicial ya es loading, así el efecto de montaje no hace setState
  // síncrono (react-hooks/set-state-in-effect); los setState viven en el
  // callback de la promesa (patrón useDiscoveries).
  useEffect(() => {
    void window.api.db.listContacts(companyId).then((result) => {
      if (result.ok) {
        setState({ status: 'ready', contacts: sortByCreatedAtAsc(result.data) })
      } else {
        setState({ status: 'error', message: result.error.message })
      }
    })
  }, [companyId])

  const createContact = useCallback(
    async (values: ContactFormValues): Promise<boolean> => {
      const result = await window.api.db.createContact({ companyId, ...values })
      if (!result.ok) {
        toast.error(result.error.message)
        return false
      }
      setState((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', contacts: [...prev.contacts, result.data] }
          : prev
      )
      toast('Contacto creado')
      return true
    },
    [companyId]
  )

  const updateContact = useCallback(
    async (id: string, values: ContactFormValues): Promise<boolean> => {
      const result = await window.api.db.updateContact(id, values)
      if (!result.ok) {
        toast.error(result.error.message)
        return false
      }
      setState((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              contacts: prev.contacts.map((contact) => (contact.id === id ? result.data : contact))
            }
          : prev
      )
      toast('Cambios guardados')
      return true
    },
    []
  )

  const generateContext = useCallback(async (id: string): Promise<void> => {
    const result = await window.api.llm.generateContactContext(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            contacts: prev.contacts.map((contact) => (contact.id === id ? result.data : contact))
          }
        : prev
    )
    toast('Contexto del contacto generado')
  }, [])

  const removeContact = useCallback(async (id: string): Promise<void> => {
    const result = await window.api.db.deleteContact(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', contacts: prev.contacts.filter((contact) => contact.id !== id) }
        : prev
    )
    toast('Contacto eliminado')
  }, [])

  return { state, createContact, updateContact, removeContact, generateContext }
}
