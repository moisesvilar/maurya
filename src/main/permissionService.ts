import { execFile } from 'child_process'
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

/**
 * Workaround del permiso de micrófono con firma ad-hoc: cada rebuild cambia el
 * cdhash del bundle y la entrada TCC deja de casar (Ajustes muestra el toggle
 * activado pero macOS deniega). `tccutil reset` borra esa entrada fósil para
 * que el siguiente intento de grabación vuelva a disparar el prompt TCC.
 * Se lanza en Terminal (visible para el usuario) vía osascript; el primer uso
 * dispara el prompt de Automatización ("Maurya quiere controlar Terminal").
 * Nunca rechaza: devuelve false si osascript falla (p. ej. permiso denegado).
 */
const TCC_RESET_COMMAND = 'tccutil reset Microphone com.maurya.app'

export function launchMicrophoneResetInTerminal(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'osascript',
      [
        '-e',
        'tell application "Terminal" to activate',
        '-e',
        `tell application "Terminal" to do script "${TCC_RESET_COMMAND}"`
      ],
      (error) => resolve(error === null)
    )
  })
}
