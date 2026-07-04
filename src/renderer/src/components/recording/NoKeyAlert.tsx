import React from 'react'
import { Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * Alert informativo cuando falta la key de Deepgram (patrón SPEC-002).
 * Extraído de TranscriptionSection del spike (SPEC-015) para compartirlo con
 * la sección Grabación de la entrevista, sin cambiar el DOM de /capture.
 */
export function NoKeyAlert(): React.ReactElement {
  return (
    <Alert>
      <Info />
      <AlertTitle>Falta la key de Deepgram</AlertTitle>
      <AlertDescription>
        La captura continúa sin transcripción. Configura la variable{' '}
        <code className="font-mono">DEEPGRAM_API_KEY</code> en el archivo{' '}
        <code className="font-mono">.env.local</code> de la raíz del proyecto y reinicia la
        aplicación.
      </AlertDescription>
    </Alert>
  )
}
