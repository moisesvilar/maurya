import type { PermissionsSnapshot, PermissionTarget } from '@/types/audio'

/** Consulta el estado de permisos sin disparar prompts TCC. */
export function getPermissionsStatus(): Promise<PermissionsSnapshot> {
  return window.api.permissions.getStatus()
}

/** Dispara el prompt TCC de micrófono. Devuelve true si queda concedido. */
export function requestMicrophoneAccess(): Promise<boolean> {
  return window.api.permissions.requestMicrophone()
}

/** Abre el pane de Ajustes del Sistema correspondiente. */
export function openPrivacySettings(target: PermissionTarget): Promise<void> {
  return window.api.permissions.openSettings(target)
}
