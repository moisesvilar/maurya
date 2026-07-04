import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { PermissionsSnapshot, PermissionState } from '@/types/audio'

interface PermissionBadgeProps {
  label: string
  state: PermissionState | undefined
}

/** Badge no-solo-color (regla 11.4): mismos literales que el spike (SPEC-001). */
function PermissionBadge({ label, state }: PermissionBadgeProps): React.ReactElement {
  const granted = state === 'granted'
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{label}</span>
      {granted ? (
        <Badge className="bg-green-600 text-white">Concedido</Badge>
      ) : (
        <Badge variant="destructive">No concedido</Badge>
      )}
    </div>
  )
}

interface PermissionBadgesProps {
  permissions: PermissionsSnapshot | null
}

/**
 * Fila compacta de permisos de la sección Grabación (SPEC-015): estado de
 * "Micrófono" y "Audio del sistema" en una sola línea (a diferencia de la
 * PermissionsSection del spike, que ocupa una sección con filas).
 */
export function PermissionBadges({ permissions }: PermissionBadgesProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <PermissionBadge label="Micrófono" state={permissions?.microphone} />
      <PermissionBadge label="Audio del sistema" state={permissions?.systemAudio} />
    </div>
  )
}
