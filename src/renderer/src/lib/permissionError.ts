import type { CaptureError } from '@/types/audio'

/**
 * Distingue los errores de permiso del resto de CaptureError (SPEC-049): solo
 * se originan en el arranque de la captura y son los únicos que se pintan
 * arriba de la página (PermissionErrorAlert) en lugar de en la sección
 * Grabación. Única definición del helper — módulo propio en lib/ porque los
 * ficheros de componentes solo exportan componentes (react-refresh).
 */
export function isPermissionError(error: CaptureError): boolean {
  return error.kind === 'microphone-permission' || error.kind === 'system-audio-permission'
}
