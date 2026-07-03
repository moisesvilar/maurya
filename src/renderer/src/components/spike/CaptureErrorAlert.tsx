import React from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { openPrivacySettings } from '@/services/permissionsService'
import type { CaptureError, PermissionTarget } from '@/types/audio'

interface CaptureErrorAlertProps {
  error: CaptureError
}

const ERROR_TITLES: Record<CaptureError['kind'], string> = {
  'microphone-permission': 'Permiso de micrófono no concedido',
  'system-audio-permission': 'Permiso de audio del sistema no concedido',
  'device-disconnected': 'Dispositivo desconectado',
  'file-write': 'Error de escritura',
  'capture-failure': 'Error al iniciar la captura'
}

const SETTINGS_TARGETS: Partial<Record<CaptureError['kind'], PermissionTarget>> = {
  'microphone-permission': 'microphone',
  'system-audio-permission': 'systemAudio'
}

export function CaptureErrorAlert({ error }: CaptureErrorAlertProps): React.ReactElement {
  const target = SETTINGS_TARGETS[error.kind]
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{ERROR_TITLES[error.kind]}</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {target !== undefined && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void openPrivacySettings(target)}
          >
            Abrir Ajustes del Sistema
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
