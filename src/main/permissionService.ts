import { shell, systemPreferences } from 'electron'
import type { PermissionsSnapshot, PermissionTarget } from '../renderer/src/types/audio'

/**
 * Deep-links a los panes de Privacidad de Ajustes del Sistema.
 * Para el audio de sistema se usa el pane de "Grabación de pantalla y audio del
 * sistema" (Privacy_ScreenCapture): el pane específico Privacy_AudioCapture no
 * está documentado (riesgo #6 del plan).
 */
const SETTINGS_URLS: Record<PermissionTarget, string> = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  systemAudio: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
}

/**
 * Consulta el estado de los permisos SIN disparar el prompt TCC.
 * 'screen' actúa como proxy del permiso de captura de audio del sistema.
 */
export function getPermissionsSnapshot(): PermissionsSnapshot {
  return {
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    systemAudio: systemPreferences.getMediaAccessStatus('screen')
  }
}

/** Dispara el prompt TCC de micrófono (solo si está not-determined). */
export function askForMicrophoneAccess(): Promise<boolean> {
  return systemPreferences.askForMediaAccess('microphone')
}

/** Abre el pane de Ajustes del Sistema correspondiente al permiso. */
export function openPrivacySettings(target: PermissionTarget): Promise<void> {
  return shell.openExternal(SETTINGS_URLS[target])
}
