import { useCallback, useState } from 'react'

/** Clave de persistencia del colapso del sidebar (nota técnica SPEC-009). */
const STORAGE_KEY = 'maurya:sidebar-collapsed'

/**
 * Estado inicial del colapso: lo persistido en localStorage manda; en el
 * primer arranque (sin valor guardado) se colapsa si la ventana es estrecha
 * (< 1024px, regla responsive de SPEC-009). Lectura defensiva: si localStorage
 * no está disponible, se cae al criterio de anchura.
 */
function readInitialCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      return stored === 'true'
    }
  } catch {
    // localStorage inaccesible: se ignora y decide la anchura de la ventana
  }
  return window.innerWidth < 1024
}

export interface UseSidebarCollapsedResult {
  collapsed: boolean
  toggle: () => void
}

/**
 * Colapso del sidebar (SPEC-009): estado con lazy init desde localStorage y
 * toggle que persiste cada cambio. La escritura es defensiva: si falla, el
 * estado en memoria sigue funcionando para la sesión actual.
 */
export function useSidebarCollapsed(): UseSidebarCollapsedResult {
  const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed)

  const toggle = useCallback((): void => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // Persistencia no disponible: el colapso sigue aplicando en memoria
      }
      return next
    })
  }, [])

  return { collapsed, toggle }
}
