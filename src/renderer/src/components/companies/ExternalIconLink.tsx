import React from 'react'
import { createLucideIcon, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Lucide retiró los iconos de marca en v1 (`Linkedin` ya no se exporta en
 * lucide-react 1.x); se recrea aquí el glifo original con createLucideIcon
 * para cumplir el wireframe de SPEC-011 sin añadir dependencias.
 */
export const LinkedinIcon: LucideIcon = createLucideIcon('Linkedin', [
  [
    'path',
    {
      d: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z',
      key: 'linkedin-path'
    }
  ],
  ['rect', { width: '4', height: '12', x: '2', y: '9', key: 'linkedin-rect' }],
  ['circle', { cx: '4', cy: '4', r: '2', key: 'linkedin-circle' }]
])

export interface ExternalIconLinkProps {
  /** URL externa (website o LinkedIn). */
  href: string
  /** Accesibilidad: "Abrir website" / "Abrir LinkedIn". */
  ariaLabel: string
  icon: LucideIcon
  /** Texto visible opcional (p. ej. el hostname en el detalle de empresa). */
  label?: string
  className?: string
}

/**
 * Enlace externo con icono (SPEC-011): `target="_blank"` + `rel="noreferrer"`
 * para que el `setWindowOpenHandler` del main lo derive al navegador por
 * defecto del sistema (`shell.openExternal`) y nunca abra ventanas de la app.
 * Se renderiza como HERMANO del Link de la fila, nunca anidado dentro de él.
 */
export function ExternalIconLink({
  href,
  ariaLabel,
  icon: Icon,
  label,
  className
}: ExternalIconLinkProps): React.ReactElement {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground',
        className
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label !== undefined && <span className="text-sm">{label}</span>}
    </a>
  )
}
