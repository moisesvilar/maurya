import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

/** Pregunta descartada mostrada en el diálogo: texto + índice REAL en `questionOutcomes`. */
export interface DiscardedQuestionEntry {
  /** Índice de la entrada en el array `questionOutcomes` completo de la entrevista. */
  index: number
  question: string
}

interface DiscardReasonsDialogProps {
  open: boolean
  /** Preguntas descartadas de la parada, en su orden en questionOutcomes. */
  entries: DiscardedQuestionEntry[]
  /** «Guardar motivos»: solo entradas con motivo no vacío tras trim. */
  onSave: (reasons: Array<{ index: number; reason: string }>) => void
  /** «Omitir», Escape o cierre: sin persistir ningún motivo. */
  onSkip: () => void
}

/**
 * Diálogo «Preguntas descartadas» (SPEC-039): se abre UNA vez al llegar el
 * resultado de la parada con ≥1 pregunta descartada. Un Textarea de motivo
 * (opcional) por pregunta; «Omitir», Escape o cerrar no persisten nada —
 * ningún dato se pierde: los outcomes ya están guardados, solo se omiten los
 * motivos. Dialog (no Sheet): 1-5 Textareas, interacción < 30 s (regla §4.1).
 */
export function DiscardReasonsDialog({
  open,
  entries,
  onSave,
  onSkip
}: DiscardReasonsDialogProps): React.ReactElement {
  const [reasons, setReasons] = useState<Record<number, string>>({})

  // Estado limpio para la siguiente parada: los motivos se vacían SIEMPRE al
  // cerrar (guardar u omitir), en los handlers — sin efectos con setState.
  const handleSkip = (): void => {
    setReasons({})
    onSkip()
  }

  const handleSave = (): void => {
    const filled = entries
      .map((entry) => ({ index: entry.index, reason: (reasons[entry.index] ?? '').trim() }))
      .filter((entry) => entry.reason !== '')
    setReasons({})
    onSave(filled)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          handleSkip()
        }
      }}
    >
      <DialogContent data-testid="discard-reasons-dialog">
        <DialogHeader>
          <DialogTitle>Preguntas descartadas</DialogTitle>
          <DialogDescription>
            Deja constancia de por qué las descartaste; se tendrá en cuenta en la nota y en los
            objetivos.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.index} className="flex flex-col gap-2">
              <p className="text-sm font-medium">{entry.question}</p>
              <Textarea
                data-testid="discard-reason-input"
                placeholder="¿Por qué la descartaste? (opcional)"
                value={reasons[entry.index] ?? ''}
                onChange={(event) =>
                  setReasons((previous) => ({ ...previous, [entry.index]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" data-testid="discard-reasons-skip" onClick={handleSkip}>
            Omitir
          </Button>
          <Button data-testid="discard-reasons-save" onClick={handleSave}>
            Guardar motivos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
