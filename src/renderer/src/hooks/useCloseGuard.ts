import { useCallback, useEffect, useState } from 'react'

export interface UseCloseGuardResult {
  closeDialogOpen: boolean
  cancelClose: () => void
  confirmClose: () => Promise<void>
}

/**
 * Guard de cierre de ventana durante la captura: main intercepta el close y
 * notifica al renderer, que muestra el AlertDialog. Al confirmar, se detiene
 * y guarda la grabación antes de autorizar el cierre.
 */
export function useCloseGuard(stopAndSave: () => Promise<unknown>): UseCloseGuardResult {
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)

  useEffect(() => {
    return window.api.window.onCloseRequested(() => {
      setCloseDialogOpen(true)
    })
  }, [])

  const cancelClose = useCallback((): void => {
    setCloseDialogOpen(false)
  }, [])

  const confirmClose = useCallback(async (): Promise<void> => {
    try {
      await stopAndSave()
    } finally {
      setCloseDialogOpen(false)
      window.api.window.confirmClose()
    }
  }, [stopAndSave])

  return { closeDialogOpen, cancelClose, confirmClose }
}
