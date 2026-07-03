import React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed'

/**
 * Shell de la app (SPEC-009): sidebar persistente + top bar + contenido.
 * El landmark `main` vive AQUÍ (las páginas pasan su root a div para evitar
 * mains anidados) y es el contenedor de scroll del contenido.
 */
export function Layout(): React.ReactElement {
  const { collapsed, toggle } = useSidebarCollapsed()
  return (
    <div className="flex h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
