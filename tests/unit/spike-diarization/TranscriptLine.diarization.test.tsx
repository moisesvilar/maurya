/**
 * Tests de la etiqueta de hablante en TranscriptLine (SPEC-004): texto muted
 * "Hablante N" (speaker + 1, Deepgram indexa desde 0) tras el Badge de fuente;
 * ausente cuando la diarización no aporta dato (Riesgo #9).
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TranscriptLine } from '@/components/spike/TranscriptLine'
import type { TranscriptLineView } from '@/hooks/useTranscription'

function lineView(speaker: number | null): TranscriptLineView {
  return {
    channel: 'mic',
    text: 'frase de prueba',
    startMs: 5000,
    endMs: 6000,
    receivedAtMs: 6100,
    offsetSeconds: 5,
    speaker
  }
}

describe('TranscriptLine (diarización)', () => {
  describe('when the line has an identified speaker', () => {
    // SPEC-004 · AC-01 (UI: etiqueta de hablante junto al Badge de fuente)
    it('renders the muted "Hablante N" label (speaker + 1) next to the source badge', () => {
      const { rerender } = render(<TranscriptLine line={lineView(0)} />)
      // Deepgram indexa desde 0 → speaker 0 se muestra como "Hablante 1"
      const label = screen.getByText('Hablante 1')
      // Texto muted, no un segundo Badge (decisión de densidad de la spec)
      expect(label).toHaveClass('text-muted-foreground')
      expect(label).not.toHaveAttribute('data-slot', 'badge')
      expect(screen.getByText('Micrófono')).toBeInTheDocument()

      rerender(<TranscriptLine line={lineView(1)} />)
      expect(screen.getByText('Hablante 2')).toBeInTheDocument()
    })
  })

  describe('when the line has no speaker information', () => {
    // SPEC-004 · AC-04 (UI: degradación sin etiqueta, solo el Badge de fuente)
    it('renders no speaker label when speaker is null, keeping only the source badge', () => {
      render(<TranscriptLine line={lineView(null)} />)
      expect(screen.queryByText(/Hablante/)).not.toBeInTheDocument()
      expect(screen.getByText('Micrófono')).toBeInTheDocument()
      expect(screen.getByText('frase de prueba')).toBeInTheDocument()
    })
  })
})
