import React from 'react'
import { Check, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { isDenied } from '@/lib/permissions'
import type { PermissionsSnapshot, PermissionState } from '@/types/audio'

const PENDING_TOOLTIP = 'macOS pedirá los permisos al iniciar la grabación'

type BadgeState = 'granted' | 'pending' | 'denied'

function badgeState(state: PermissionState | undefined): BadgeState {
  if (state === 'granted') return 'granted'
  if (isDenied(state)) return 'denied'
  // not-determined, unknown o snapshot aún null: el permiso no se pidió todavía
  return 'pending'
}

interface PermissionBadgeProps {
  label: string
  state: PermissionState | undefined
  testId: string
}

/**
 * Badge de permiso compacto (SPEC-055-iter-1), semántica ternaria
 * (SPEC-055-iter-2): la etiqueta + un chip de color con ✓ (verde, concedido),
 * «?» (ámbar, pendiente: aún sin pedir; tooltip con el siguiente paso) o
 * ✗ (rojo, denegado). El literal se conserva como texto `sr-only` (regla 11.4:
 * no-solo-color + nombre accesible; el glifo va aria-hidden).
 */
function PermissionBadge({ label, state, testId }: PermissionBadgeProps): React.ReactElement {
  const visual = badgeState(state)
  const chip = (
    <span
      data-testid={testId}
      data-state={visual}
      className={cn(
        'flex size-4 items-center justify-center rounded-full text-white',
        visual === 'granted' && 'bg-green-600',
        visual === 'pending' && 'bg-amber-600',
        visual === 'denied' && 'bg-destructive'
      )}
    >
      {visual === 'granted' && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
      {visual === 'pending' && (
        <span className="text-[10px] font-bold leading-none" aria-hidden="true">
          ?
        </span>
      )}
      {visual === 'denied' && <X className="size-3" strokeWidth={3} aria-hidden="true" />}
      <span className="sr-only">
        {visual === 'granted' ? 'Concedido' : visual === 'pending' ? 'Pendiente' : 'No concedido'}
      </span>
    </span>
  )
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm">{label}</span>
      {visual === 'pending' ? (
        <Tooltip>
          <TooltipTrigger asChild>{chip}</TooltipTrigger>
          <TooltipContent>{PENDING_TOOLTIP}</TooltipContent>
        </Tooltip>
      ) : (
        chip
      )}
    </div>
  )
}

interface PermissionBadgesProps {
  permissions: PermissionsSnapshot | null
}

/**
 * Fila compacta de permisos de la Topbar (SPEC-015; compactada en
 * SPEC-055-iter-1; ternaria en SPEC-055-iter-2): estado de «Micrófono» y
 * «Audio del sistema» en una línea.
 */
export function PermissionBadges({ permissions }: PermissionBadgesProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <PermissionBadge
        label="Micrófono"
        state={permissions?.microphone}
        testId="permission-badge-microphone"
      />
      <PermissionBadge
        label="Audio del sistema"
        state={permissions?.systemAudio}
        testId="permission-badge-system"
      />
    </div>
  )
}
