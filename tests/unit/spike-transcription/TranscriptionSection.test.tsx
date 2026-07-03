/**
 * Tests de TranscriptionSection (SPEC-002): Badge de estado, distinción visual
 * del parcial en curso y empty state. El autoscroll NO se aserta aquí: jsdom no
 * hace layout (scrollHeight siempre 0), cualquier assert sería frágil → gap
 * justificado en spec-test-map.json (verificación manual).
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TranscriptionSection } from '@/components/spike/TranscriptionSection'
import type { TranscriptLineView, TranscriptPartials } from '@/hooks/useTranscription'

const EMPTY_PARTIALS: TranscriptPartials = { mic: '', system: '' }

const FINAL_LINE: TranscriptLineView = {
  channel: 'mic',
  text: 'línea final consolidada',
  startMs: 1000,
  endMs: 2600,
  receivedAtMs: 2700,
  offsetSeconds: 1
}

describe('TranscriptionSection', () => {
  describe('when results are arriving', () => {
    // SPEC-002 · AC-03
    it('renders the in-progress partial visually distinct (muted italic) from the final lines', () => {
      render(
        <TranscriptionSection
          status="active"
          lines={[FINAL_LINE]}
          partials={{ mic: 'parcial en curso', system: '' }}
        />
      )
      // jsdom no aplica estilos de Tailwind: se asertan las clases, no la visibilidad
      const partial = screen.getByText('parcial en curso')
      expect(partial).toHaveClass('italic')
      expect(partial).toHaveClass('text-muted-foreground')
      const finalLine = screen.getByText('línea final consolidada')
      expect(finalLine).not.toHaveClass('italic')
      expect(finalLine).not.toHaveClass('text-muted-foreground')
    })
  })

  describe('when the connection state changes', () => {
    // SPEC-002 · AC-04
    it('shows a status badge whose text changes with the state, with "Transcribiendo" while connected', () => {
      const { rerender } = render(
        <TranscriptionSection status="active" lines={[]} partials={EMPTY_PARTIALS} />
      )
      expect(screen.getByText('Transcribiendo')).toBeInTheDocument()

      // Estado no-solo-color: el texto del Badge cambia junto al color
      rerender(<TranscriptionSection status="inactive" lines={[]} partials={EMPTY_PARTIALS} />)
      expect(screen.getByText('Inactiva')).toBeInTheDocument()

      rerender(<TranscriptionSection status="disconnected" lines={[]} partials={EMPTY_PARTIALS} />)
      expect(screen.getByText('Desconectado')).toBeInTheDocument()

      rerender(<TranscriptionSection status="no-key" lines={[]} partials={EMPTY_PARTIALS} />)
      expect(screen.getByText('Sin key')).toBeInTheDocument()
    })
  })

  describe('when the transcription is active but no speech has been detected yet', () => {
    // SPEC-002 · AC-09
    it('shows the "Esperando audio…" placeholder only while active and without results', () => {
      const { rerender } = render(
        <TranscriptionSection status="active" lines={[]} partials={EMPTY_PARTIALS} />
      )
      expect(screen.getByText('Esperando audio…')).toBeInTheDocument()

      // Inactiva: sin placeholder
      rerender(<TranscriptionSection status="inactive" lines={[]} partials={EMPTY_PARTIALS} />)
      expect(screen.queryByText('Esperando audio…')).not.toBeInTheDocument()

      // Activa pero ya con resultados: sin placeholder
      rerender(
        <TranscriptionSection status="active" lines={[FINAL_LINE]} partials={EMPTY_PARTIALS} />
      )
      expect(screen.queryByText('Esperando audio…')).not.toBeInTheDocument()

      // Activa con un parcial en curso: tampoco
      rerender(
        <TranscriptionSection
          status="active"
          lines={[]}
          partials={{ mic: 'parcial', system: '' }}
        />
      )
      expect(screen.queryByText('Esperando audio…')).not.toBeInTheDocument()
    })
  })
})
