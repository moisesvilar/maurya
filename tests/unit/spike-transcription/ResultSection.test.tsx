/**
 * Tests de ResultSection (SPEC-002): fila con la ruta del transcript.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResultSection } from '@/components/spike/ResultSection'
import type { StopResult } from '@/types/audio'

const WAV_PATH = '/tmp/maurya-recordings/spike-20260703.wav'
const TRANSCRIPT_PATH = '/tmp/maurya-recordings/spike-20260703.transcript.json'

function stopResult(transcriptPath: string | null): StopResult {
  return {
    filePath: WAV_PATH,
    durationSeconds: 12,
    sizeBytes: 44 + 12 * 16000 * 4,
    sampleRate: 16000,
    channels: 2,
    transcriptPath
  }
}

describe('ResultSection', () => {
  describe('when the recording finished with a transcript', () => {
    // SPEC-002 · AC-06
    it('shows the transcript file path in addition to the WAV path, sharing a single "Mostrar en Finder"', () => {
      const { rerender } = render(
        <ResultSection result={stopResult(TRANSCRIPT_PATH)} onShowInFinder={vi.fn()} />
      )
      expect(screen.getByText(WAV_PATH)).toBeInTheDocument()
      expect(screen.getByText(TRANSCRIPT_PATH)).toBeInTheDocument()
      // Ambos archivos comparten carpeta: un único botón para abrirla
      expect(screen.getAllByRole('button', { name: 'Mostrar en Finder' })).toHaveLength(1)

      // Sin transcript (transcriptPath null) la fila no aparece
      rerender(<ResultSection result={stopResult(null)} onShowInFinder={vi.fn()} />)
      expect(screen.getByText(WAV_PATH)).toBeInTheDocument()
      expect(screen.queryByText(TRANSCRIPT_PATH)).not.toBeInTheDocument()
    })
  })
})
