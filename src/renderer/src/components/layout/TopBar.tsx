import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GlobalSearchDialog } from '@/components/search/GlobalSearchDialog'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

/**
 * Mapa prefijo de ruta → título de sección (SPEC-009). `/settings` va primero
 * y captura también `/settings/note-templates/*` ("Ajustes", nota técnica).
 * El orden importa solo conceptualmente aquí (no hay prefijos solapados).
 */
const SECTION_TITLES: ReadonlyArray<{ prefix: string; title: string }> = [
  { prefix: '/settings', title: 'Ajustes' },
  // SPEC-020: la sección pasa a "Capturas" (/captures, cubre /captures/:id).
  { prefix: '/captures', title: 'Capturas' },
  { prefix: '/discoveries', title: 'Discoveries' },
  // SPEC-044: sección global de empresas (/companies, cubre /companies/:id).
  { prefix: '/companies', title: 'Empresas' },
  { prefix: '/templates', title: 'Plantillas' }
]

/** Título de la sección activa; fallback para rutas desconocidas (404). */
function sectionTitleFor(pathname: string): string {
  const match = SECTION_TITLES.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  )
  return match?.title ?? 'Página no encontrada'
}

interface TopBarProps {
  /**
   * Callback ref del slot de contenido por ruta (SPEC-034): Layout lo alimenta
   * para publicar el nodo por TopBarSlotContext. Opcional: sin él (tests que
   * montan TopBar suelta) el slot queda inerte.
   */
  slotRef?: (node: HTMLDivElement | null) => void
}

/**
 * Top bar del layout (SPEC-009): landmark banner con el título de la sección
 * activa como h1. SPEC-018 añade en la zona derecha el disparador de la
 * búsqueda global ("Buscar" + pista ⌘K, aria-hidden para no ensuciar el
 * accessible name) y el atajo ⌘K/Ctrl+K global con preventDefault y cleanup.
 * SPEC-034 añade un slot vacío (display: contents, para que lo portalado
 * participe como flex item directo del header sin gap fantasma) antes del
 * botón Buscar, y permite el wrap a dos filas en mobile (min-h-14 flex-wrap).
 */
export function TopBar({ slotRef }: TopBarProps): React.ReactElement {
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
    <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-y-2 border-b px-6 py-2">
      <h1 className="text-lg font-semibold">{sectionTitleFor(pathname)}</h1>
      <div ref={slotRef} className="contents" />
      {/* Buscar + selector de tema agrupados para que justify-between no los separe */}
      <div className="flex items-center gap-2">
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
        <ThemeToggle />
      </div>
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}
