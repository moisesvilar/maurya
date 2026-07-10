import React from 'react'
import { Users } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * Alert informativo del modo degradado sin diarización (SPEC-022, patrón
 * NoKeyAlert): la conexión con diarización se rechazó y el fallback abrió sin
 * ella. No es destructive — nada ha fallado de forma irrecuperable, la
 * transcripción sigue. Persistente mientras dure la sesión (no Toast); sin
 * botones. Desaparece al terminar la grabación (gate en RecordingSection).
 */
export function DegradedTranscriptionAlert(): React.ReactElement {
  return (
    <Alert data-testid="transcription-degraded-alert">
      <Users aria-hidden="true" />
      <AlertDescription>
        Transcribiendo sin atribución de hablante. La transcripción y el asistente siguen
        funcionando.
      </AlertDescription>
    </Alert>
  )
}
