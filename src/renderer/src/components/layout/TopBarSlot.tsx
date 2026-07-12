import React, { useContext } from 'react'
import { createPortal } from 'react-dom'

/**
 * Nodo del slot de la top bar (SPEC-034): Layout lo publica desde un callback
 * ref de TopBar. Fuera del Layout (tests que montan páginas sueltas) vale
 * null y TopBarPortal es un no-op.
 */
// El contexto convive con TopBarPortal a propósito (plan SPEC-034): son las
// dos mitades del mismo mecanismo; perder fast-refresh en este archivo es
// irrelevante (no tiene estado propio).
// eslint-disable-next-line react-refresh/only-export-components
export const TopBarSlotContext = React.createContext<HTMLElement | null>(null)

interface TopBarPortalProps {
  children: React.ReactNode
}

/**
 * Portal null-safe al slot de la top bar: la página portala contenido
 * específico de su ruta (controles compactos de la captura) solo si el nodo
 * existe. Se evita setContent(ReactNode) en estado del Layout (bucle de
 * renders) y getElementById en render (lectura del DOM + crash sin Layout).
 */
export function TopBarPortal({ children }: TopBarPortalProps): React.ReactElement | null {
  const node = useContext(TopBarSlotContext)
  if (node === null) {
    return null
  }
  return createPortal(children, node)
}
