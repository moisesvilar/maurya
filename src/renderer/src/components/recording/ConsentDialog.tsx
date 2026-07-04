import React, { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'

interface ConsentDialogProps {
  open: boolean
  /** Cierre sin arrancar (Cancelar, Escape, click fuera): nunca persiste nada. */
  onCancel: () => void
  /** Confirmación informada: arranca la grabación; `dontShowAgain` refleja la casilla. */
  onConfirm: (dontShowAgain: boolean) => void
}

/**
 * Diálogo "Aviso de grabación" (SPEC-019): recordatorio de la responsabilidad
 * legal de informar al interlocutor antes de grabar. AlertDialog (regla 6.3)
 * con el foco inicial en "Cancelar" (comportamiento por defecto de Radix,
 * regla 11.1) y acción default — no destructive — porque iniciar una grabación
 * es una confirmación informada, no una acción destructiva (excepción
 * documentada en la spec). La casilla vive FUERA de AlertDialogDescription
 * (que es un <p>) y se resetea al cerrar, de modo que cada apertura empieza
 * desmarcada: cancelar con la casilla marcada nunca persiste la preferencia.
 */
export function ConsentDialog({
  open,
  onCancel,
  onConfirm
}: ConsentDialogProps): React.ReactElement {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          // Todo cierre deja la casilla limpia para la próxima apertura
          setDontShowAgain(false)
          onCancel()
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Aviso de grabación</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a grabar y transcribir esta conversación. Es tu responsabilidad informar a tu
            interlocutor y contar con su consentimiento antes de empezar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          No volver a mostrar este aviso
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(dontShowAgain)}>
            Entendido, iniciar grabación
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
