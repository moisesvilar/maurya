/**
 * Tests de TranscriptLine (SPEC-002): etiqueta de fuente por canal y timestamp.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TranscriptLine } from '@/components/spike/TranscriptLine'
import type { TranscriptLineView } from '@/hooks/useTranscription'

function lineView(overrides: Partial<TranscriptLineView>): TranscriptLineView {
  return {
    channel: 'mic',
    text: 'texto de prueba',
    startMs: 5000,
    endMs: 6000,
    receivedAtMs: 6100,
    offsetSeconds: 5,
    // SPEC-004 hizo speaker requerido; la etiqueta se testea en spike-diarization
    speaker: null,
    ...overrides
  }
}

describe('TranscriptLine', () => {
  describe('when rendering final lines from each channel', () => {
    // SPEC-002 · AC-02
    it('labels each final line with its source badge (Micrófono/Sistema) and an mm:ss timestamp', () => {
      const { rerender } = render(
        <TranscriptLine line={lineView({ channel: 'mic', text: 'hola desde el micro' })} />
      )
      expect(screen.getByText('Micrófono')).toBeInTheDocument()
      expect(screen.getByText('hola desde el micro')).toBeInTheDocument()
      expect(screen.getByText('00:05')).toBeInTheDocument()

      rerender(
        <TranscriptLine
          line={lineView({ channel: 'system', text: 'hola desde el sistema', offsetSeconds: 754 })}
        />
      )
      expect(screen.getByText('Sistema')).toBeInTheDocument()
      expect(screen.getByText('hola desde el sistema')).toBeInTheDocument()
      expect(screen.getByText('12:34')).toBeInTheDocument()
    })
  })
})
