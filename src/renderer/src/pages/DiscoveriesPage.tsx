import React from 'react'
import { FolderSearch } from 'lucide-react'

/**
 * Sección Discoveries (SPEC-009): página contenedora con empty state a la
 * espera del CRUD de H2. Sin CTA funcional todavía (matiz de alcance).
 */
export function DiscoveriesPage(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FolderSearch className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-lg font-semibold">Aún no hay discoveries</p>
      <p className="text-sm text-muted-foreground">
        La gestión de discoveries llegará en la siguiente fase
      </p>
    </div>
  )
}
