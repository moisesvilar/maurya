import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GlobalSearchDialog } from '@/components/search/GlobalSearchDialog'

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
 * activa como h1. SPEC-018 añade en la zona derecha el disparador de la
 * búsqueda global ("Buscar" + pista ⌘K, aria-hidden para no ensuciar el
 * accessible name) y el atajo ⌘K/Ctrl+K global con preventDefault y cleanup.
 */
export function TopBar(): React.ReactElement {
  const { pathname } = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
      <h1 className="text-lg font-semibold">{sectionTitleFor(pathname)}</h1>
      <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
        <Search />
        Buscar
        <kbd
          aria-hidden="true"
          className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
        >
          ⌘K
        </kbd>
      </Button>
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}
