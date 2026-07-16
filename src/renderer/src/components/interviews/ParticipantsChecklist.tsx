import React from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import type { Contact } from '@/types/domain'

export interface ParticipantsChecklistProps {
  /** Contactos de la empresa elegida (todas las opciones visibles). */
  contacts: Contact[]
  /** Ids marcados, en el orden de marcado (orden persistido en contactIds). */
  selectedIds: string[]
  /** Notifica la lista completa tras marcar (append) o desmarcar (filter). */
  onChange: (selectedIds: string[]) => void
  /** Texto muted cuando la empresa no tiene contactos. */
  emptyMessage: string
}

/**
 * Lista de Checkbox de participantes (SPEC-046): multiselección visible de
 * los contactos de una empresa — decisión de UX de la spec (pocas opciones,
 * todas visibles con descripción, análogo a RadioGroup; el design system no
 * tiene multiselect). Marcar añade al FINAL (el orden de marcado es el orden
 * persistido en `contactIds`); desmarcar filtra. La lista scrollea dentro
 * (max-h-48) para que el Dialog no crezca sin límite en mobile. El label
 * «Participantes» lo pone cada caller (los htmlFor/ids varían por flujo).
 * Reutilizada por GroupInterviewFormDialog, InterviewFormDialog,
 * EditCaptureDialog y AssignCompanySheet.
 */
export function ParticipantsChecklist({
  contacts,
  selectedIds,
  onChange,
  emptyMessage
}: ParticipantsChecklistProps): React.ReactElement {
  return (
    <div
      data-testid="interview-participants"
      className="flex max-h-48 flex-col gap-2 overflow-y-auto"
    >
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        contacts.map((contact) => (
          <label key={contact.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selectedIds.includes(contact.id)}
              onCheckedChange={(checked) => {
                if (checked === true) {
                  onChange([...selectedIds, contact.id])
                } else {
                  onChange(selectedIds.filter((id) => id !== contact.id))
                }
              }}
            />
            <span className="min-w-0 truncate">{contact.name}</span>
            {contact.position !== null && (
              <span className="min-w-0 truncate text-muted-foreground">{contact.position}</span>
            )}
          </label>
        ))
      )}
    </div>
  )
}
