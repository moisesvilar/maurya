import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { TopBarSlotContext } from '@/components/layout/TopBarSlot'
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed'

/**
 * Shell de la app (SPEC-009): sidebar persistente + top bar + contenido.
 * El landmark `main` vive AQUÍ (las páginas pasan su root a div para evitar
 * mains anidados) y es el contenedor de scroll del contenido.
 * SPEC-034: publica por TopBarSlotContext el nodo del slot de la top bar
 * (callback ref de TopBar) para que las páginas portalen controles propios.
 */
export function Layout(): React.ReactElement {
  const { collapsed, toggle } = useSidebarCollapsed()
  const [slotNode, setSlotNode] = useState<HTMLElement | null>(null)
  return (
    <div className="flex h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <TopBarSlotContext.Provider value={slotNode}>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar slotRef={setSlotNode} />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </TopBarSlotContext.Provider>
    </div>
  )
}
