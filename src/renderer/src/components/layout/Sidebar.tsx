import React from 'react'
import { FileText, FolderSearch, Mic, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

/**
 * Secciones del sidebar (SPEC-009): orden e iconos fijados por la spec.
 * SPEC-020: "Captura" pasa a "Capturas" (→ /captures), mismo icono y posición.
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/discoveries', label: 'Discoveries', icon: FolderSearch },
  { to: '/templates', label: 'Plantillas', icon: FileText },
  { to: '/captures', label: 'Capturas', icon: Mic },
  { to: '/settings', label: 'Ajustes', icon: Settings }
]

/**
 * Item de navegación: NavLink con estado activo por prefijo de ruta (NavLink
 * sin `end` marca también los descendientes, p. ej. /settings/note-templates/*
 * mantiene "Ajustes" activo). Activo = fondo accent + font-medium (indicador
 * no basado solo en color, regla 11.4). Colapsado: solo icono con label
 * sr-only y Tooltip a la derecha; expandido: sin Tooltip.
 */
function SidebarItem({
  item,
  collapsed
}: {
  item: NavItem
  collapsed: boolean
}): React.ReactElement {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
          collapsed && 'justify-center px-2',
          isActive && 'bg-accent font-medium text-accent-foreground'
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
    </NavLink>
  )

  if (!collapsed) {
    return link
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

/**
 * Sidebar de navegación principal (SPEC-009), construido a mano con
 * primitivas + Tailwind (decisión documentada: no usar el componente sidebar
 * de shadcn, sobredimensionado para 4 items fijos). Ancho 240px expandido /
 * 64px colapsado; el colapso lo gobierna el Layout vía useSidebarCollapsed.
 */
export function Sidebar({ collapsed, onToggle }: SidebarProps): React.ReactElement {
  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        'flex shrink-0 flex-col border-r bg-background transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div
        className={cn('flex h-14 items-center border-b px-4', collapsed && 'justify-center px-0')}
      >
        <span className="text-base font-semibold">{collapsed ? 'M' : 'Maurya'}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => (
          <SidebarItem key={item.to} item={item} collapsed={collapsed} />
        ))}
      </div>
      <div className={cn('flex border-t p-2', collapsed && 'justify-center')}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? 'Expandir navegación' : 'Colapsar navegación'}
          onClick={onToggle}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
    </nav>
  )
}
