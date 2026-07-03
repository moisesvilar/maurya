import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { PermissionsSnapshot, PermissionState } from '@/types/audio'

interface PermissionsSectionProps {
  permissions: PermissionsSnapshot | null
}

interface PermissionRowProps {
  label: string
  state: PermissionState | undefined
}

function PermissionRow({ label, state }: PermissionRowProps): React.ReactElement {
  const granted = state === 'granted'
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      {granted ? (
        <Badge className="bg-green-600 text-white">Concedido</Badge>
      ) : (
        <Badge variant="destructive">No concedido</Badge>
      )}
    </div>
  )
}

export function PermissionsSection({ permissions }: PermissionsSectionProps): React.ReactElement {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Permisos</h3>
      <PermissionRow label="Micrófono" state={permissions?.microphone} />
      <PermissionRow label="Audio del sistema" state={permissions?.systemAudio} />
    </section>
  )
}
