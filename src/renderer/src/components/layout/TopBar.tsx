import React from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Mapa prefijo de ruta → título de sección (SPEC-009). `/settings` va primero
 * y captura también `/settings/note-templates/*` ("Ajustes", nota técnica).
 * El orden importa solo conceptualmente aquí (no hay prefijos solapados).
 */
const SECTION_TITLES: ReadonlyArray<{ prefix: string; title: string }> = [
  { prefix: '/settings', title: 'Ajustes' },
  { prefix: '/capture', title: 'Captura' },
  { prefix: '/discoveries', title: 'Discoveries' },
  { prefix: '/templates', title: 'Plantillas' }
]

/** Título de la sección activa; fallback para rutas desconocidas (404). */
function sectionTitleFor(pathname: string): string {
  const match = SECTION_TITLES.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  )
  return match?.title ?? 'Página no encontrada'
}

/**
 * Top bar del layout (SPEC-009): landmark banner con el título de la sección
 * activa como h1 (las páginas raíz ya no llevan h1 propio). Sin búsqueda ni
 * más elementos en esta spec (RF-APP-005 queda para H7).
 */
export function TopBar(): React.ReactElement {
  const { pathname } = useLocation()
  return (
    <header className="flex h-14 shrink-0 items-center border-b px-6">
      <h1 className="text-lg font-semibold">{sectionTitleFor(pathname)}</h1>
    </header>
  )
}
