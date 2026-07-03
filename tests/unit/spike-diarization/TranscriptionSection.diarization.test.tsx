/**
 * Tests del área de transcript con diarización (SPEC-004): líneas consecutivas
 * de hablantes distintos se muestran cada una con su propia etiqueta.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TranscriptionSection } from '@/components/spike/TranscriptionSection'
import type { TranscriptLineView, TranscriptPartials } from '@/hooks/useTranscription'

const EMPTY_PARTIALS: TranscriptPartials = { mic: '', system: '' }

function line(text: string, speaker: number, index: number): TranscriptLineView {
  return {
    channel: 'mic',
    text,
    startMs: 1000 + index * 2000,
    endMs: 2600 + index * 2000,
    receivedAtMs: 2700 + index * 2000,
    offsetSeconds: 1 + index * 2,
    speaker
  }
}

describe('TranscriptionSection (diarización)', () => {
  describe('when consecutive lines belong to different speakers on the same channel', () => {
    // SPEC-004 · AC-03
    it('renders each consecutive line with its own speaker label, without grouping them', () => {
      render(
        <TranscriptionSection
          status="active"
          lines={[line('pregunta del entrevistador', 0, 0), line('respuesta del candidato', 1, 1)]}
          partials={EMPTY_PARTIALS}
        />
      )

      // Cada línea conserva su fila propia con SU etiqueta (sin agrupar)
      const firstRow = screen.getByText('pregunta del entrevistador').parentElement
      const secondRow = screen.getByText('respuesta del candidato').parentElement
      if (firstRow === null || secondRow === null) {
        throw new Error('Las líneas del transcript deben renderizarse en filas propias')
      }
      expect(firstRow).not.toBe(secondRow)
      expect(within(firstRow).getByText('Hablante 1')).toBeInTheDocument()
      expect(within(secondRow).getByText('Hablante 2')).toBeInTheDocument()
      // Y ambas mantienen su Badge de fuente
      expect(within(firstRow).getByText('Micrófono')).toBeInTheDocument()
      expect(within(secondRow).getByText('Micrófono')).toBeInTheDocument()
    })
  })
})
