import React from 'react'
import { CaptureErrorAlert } from '@/components/spike/CaptureErrorAlert'
import { isPermissionError } from '@/lib/permissionError'
import type { CaptureError } from '@/types/audio'

interface PermissionErrorAlertProps {
  error: CaptureError | null
}

/**
 * Alert de error de permiso arriba de la página (SPEC-049): wrapper fino que
 * las páginas de detalle pintan inmediatamente bajo la cabecera, antes de
 * Objetivos, para que el fallo de permisos al iniciar la grabación se vea sin
 * hacer scroll. Reutiliza CaptureErrorAlert (título por kind, mensaje y botón
 * «Abrir Ajustes del Sistema»). Con error null o no-de-permiso no pinta nada:
 * esos errores siguen en la sección Grabación. Persistente hasta que una
 * nueva grabación arranca correctamente (el controller limpia su error).
 */
export function PermissionErrorAlert({
  error
}: PermissionErrorAlertProps): React.ReactElement | null {
  if (error === null || !isPermissionError(error)) {
    return null
  }
  return (
    <div data-testid="permission-error-alert">
      <CaptureErrorAlert error={error} />
    </div>
  )
}
