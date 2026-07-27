import React from 'react'
import { Button } from '@/components/ui/button'
import { isDenied } from '@/lib/permissions'
import { openPrivacySettings } from '@/services/permissionsService'
import type { PermissionsSnapshot, PermissionTarget } from '@/types/audio'

interface OpenSettingsButtonProps {
  permissions: PermissionsSnapshot | null
}

/**
 * Botón «Abrir Ajustes del Sistema» junto a los badges de permisos (SPEC-049;
 * criterio SPEC-055-iter-2): única fuente de la lógica de visibilidad/destino.
 * Se muestra solo con algún permiso en denegación dura (denied/restricted) —
 * con permisos pendientes (not-determined) no hay fila de Maurya en Ajustes
 * que activar, y el prompt se dispara al iniciar la grabación. Un solo botón,
 * no uno por permiso: su destino es el primer permiso denegado, micrófono con
 * prioridad (primer paso del flujo).
 */
export function OpenSettingsButton({
  permissions
}: OpenSettingsButtonProps): React.ReactElement | null {
  const microphoneDenied = isDenied(permissions?.microphone)
  const systemAudioDenied = isDenied(permissions?.systemAudio)
  if (!microphoneDenied && !systemAudioDenied) {
    return null
  }
  const target: PermissionTarget = microphoneDenied ? 'microphone' : 'systemAudio'
  return (
    <Button
      variant="destructive"
      size="sm"
      data-testid="open-settings-button"
      onClick={() => void openPrivacySettings(target)}
    >
      Abrir Ajustes del Sistema
    </Button>
  )
}
