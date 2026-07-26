import React, { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { resetMicrophonePermission } from '@/services/permissionsService'
import type { PermissionsSnapshot } from '@/types/audio'

interface MicWorkaroundButtonProps {
  permissions: PermissionsSnapshot | null
}

type WorkaroundDialog = 'launched' | 'failed' | null

/**
 * Workaround del permiso de micrófono con firma ad-hoc: tras un rebuild la
 * entrada TCC deja de casar con el cdhash del bundle y macOS deniega el micro
 * aunque Ajustes muestre el toggle activado. El botón lanza en Terminal
 * `tccutil reset Microphone com.maurya.app` (borra la entrada fósil) y después
 * indica al usuario que relance la app e inicie una grabación para volver a
 * disparar el prompt TCC. Misma visibilidad que el caso micrófono de
 * OpenSettingsButton: micrófono en estado distinto de `granted`.
 */
export function MicWorkaroundButton({
  permissions
}: MicWorkaroundButtonProps): React.ReactElement | null {
  const [dialog, setDialog] = useState<WorkaroundDialog>(null)
  if (permissions?.microphone === 'granted') {
    return null
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        data-testid="mic-workaround-button"
        onClick={() => {
          void resetMicrophonePermission().then((launched) => {
            setDialog(launched ? 'launched' : 'failed')
          })
        }}
      >
        Workaround permisos micrófono
      </Button>
      <AlertDialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === 'failed' ? 'No se pudo lanzar el workaround' : 'Workaround lanzado'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === 'failed'
                ? 'No se pudo abrir Terminal. Ejecuta manualmente «tccutil reset Microphone com.maurya.app» en una terminal y, después, relanza Maurya e inicia una grabación para volver a conceder el permiso.'
                : 'Se ha abierto Terminal con «tccutil reset Microphone com.maurya.app». Cuando termine, relanza Maurya e inicia una grabación: macOS volverá a pedir el permiso de micrófono.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDialog(null)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
