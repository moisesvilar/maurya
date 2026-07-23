import React from 'react'
import { Button } from '@/components/ui/button'
import { openPrivacySettings } from '@/services/permissionsService'
import type { PermissionsSnapshot, PermissionTarget } from '@/types/audio'

interface OpenSettingsButtonProps {
  permissions: PermissionsSnapshot | null
}

/**
 * Botón «Abrir Ajustes del Sistema» junto a los badges de permisos (SPEC-049):
 * única fuente de la lógica de visibilidad/destino. Se muestra con el mismo
 * criterio con el que PermissionBadges pinta «No concedido» (estado distinto
 * de `granted`, incluido snapshot null) y desaparece con ambos permisos
 * concedidos. Un solo botón, no uno por permiso: su destino es el primer
 * permiso no concedido, micrófono con prioridad (primer paso del flujo).
 */
export function OpenSettingsButton({
  permissions
}: OpenSettingsButtonProps): React.ReactElement | null {
  const microphoneGranted = permissions?.microphone === 'granted'
  const systemAudioGranted = permissions?.systemAudio === 'granted'
  if (microphoneGranted && systemAudioGranted) {
    return null
  }
  const target: PermissionTarget = microphoneGranted ? 'systemAudio' : 'microphone'
  return (
    <Button
      variant="outline"
      size="sm"
      data-testid="open-settings-button"
      onClick={() => void openPrivacySettings(target)}
    >
      Abrir Ajustes del Sistema
    </Button>
  )
}
