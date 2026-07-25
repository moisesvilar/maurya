import React from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PermissionsSnapshot, PermissionState } from '@/types/audio'

interface PermissionBadgeProps {
  label: string
  state: PermissionState | undefined
}

/**
 * Badge de permiso compacto (SPEC-055-iter-1): la etiqueta + un chip de color
 * con ✓ (verde, concedido) o ✗ (rojo, no concedido) — sin el pill de texto
 * «Concedido»/«No concedido». El literal se conserva como texto `sr-only`
 * (regla 11.4: no-solo-color + nombre accesible; el icono va aria-hidden).
 */
function PermissionBadge({ label, state }: PermissionBadgeProps): React.ReactElement {
  const granted = state === 'granted'
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm">{label}</span>
      <span
        className={cn(
          'flex size-4 items-center justify-center rounded-full text-white',
          granted ? 'bg-green-600' : 'bg-destructive'
        )}
      >
        {granted ? (
          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
        ) : (
          <X className="size-3" strokeWidth={3} aria-hidden="true" />
        )}
        <span className="sr-only">{granted ? 'Concedido' : 'No concedido'}</span>
      </span>
    </div>
  )
}

interface PermissionBadgesProps {
  permissions: PermissionsSnapshot | null
}

/**
 * Fila compacta de permisos de la Topbar (SPEC-015; compactada en
 * SPEC-055-iter-1): estado de «Micrófono» y «Audio del sistema» en una línea.
 */
export function PermissionBadges({ permissions }: PermissionBadgesProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <PermissionBadge label="Micrófono" state={permissions?.microphone} />
      <PermissionBadge label="Audio del sistema" state={permissions?.systemAudio} />
    </div>
  )
}
