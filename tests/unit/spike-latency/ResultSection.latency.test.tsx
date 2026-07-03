/**
 * Tests de la fila "Latencia STT" de ResultSection (SPEC-003).
 * Lección jsdom: los colores del Badge se verifican por clase (bg-green-600) o
 * por variante (data-variant="destructive") y por texto OK/Lenta, nunca por
 * computed styles.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResultSection } from '@/components/spike/ResultSection'
import type { LatencyStats, StopResult } from '@/types/audio'

const WAV_PATH = '/tmp/maurya-recordings/spike-20260703.wav'

function stopResult(latency: LatencyStats | null): StopResult {
  return {
    filePath: WAV_PATH,
    durationSeconds: 12,
    sizeBytes: 44 + 12 * 16000 * 4,
    sampleRate: 16000,
    channels: 2,
    transcriptPath: '/tmp/maurya-recordings/spike-20260703.transcript.json',
    latency
  }
}

describe('ResultSection', () => {
  describe('when the session produced final transcription results', () => {
    // SPEC-003 · AC-01
    it('shows the "Latencia STT" row with median, p95, max in seconds (1 decimal, es-ES comma) and the result count', () => {
      const { rerender } = render(
        <ResultSection
          result={stopResult({ count: 14, p50Ms: 1200, p95Ms: 2800, maxMs: 3100 })}
          onShowInFinder={vi.fn()}
        />
      )
      expect(screen.getByText('Latencia STT')).toBeInTheDocument()
      expect(
        screen.getByText('mediana 1,2 s · p95 2,8 s · máx 3,1 s · 14 resultados')
      ).toBeInTheDocument()

      // Con un único resultado el contador va en singular: "1 resultado"
      rerender(
        <ResultSection
          result={stopResult({ count: 1, p50Ms: 900, p95Ms: 900, maxMs: 900 })}
          onShowInFinder={vi.fn()}
        />
      )
      expect(
        screen.getByText('mediana 0,9 s · p95 0,9 s · máx 0,9 s · 1 resultado')
      ).toBeInTheDocument()
    })

    // SPEC-003 · AC-02
    it('shows a green "OK" badge when p95 is at or under the 5 s threshold', () => {
      render(
        <ResultSection
          // Frontera exacta del umbral: p95Ms = 5000 sigue siendo OK (≤ 5 s)
          result={stopResult({ count: 8, p50Ms: 2100, p95Ms: 5000, maxMs: 5000 })}
          onShowInFinder={vi.fn()}
        />
      )
      const badge = screen.getByText('OK')
      expect(badge).toHaveClass('bg-green-600')
      expect(screen.queryByText('Lenta')).not.toBeInTheDocument()
    })

    // SPEC-003 · AC-03
    it('shows a red "Lenta" badge when p95 exceeds 5 s (raw value, not the rounded display)', () => {
      render(
        <ResultSection
          // 5001 ms se muestra redondeado como "5,0 s" pero el umbral compara el crudo
          result={stopResult({ count: 8, p50Ms: 2100, p95Ms: 5001, maxMs: 6200 })}
          onShowInFinder={vi.fn()}
        />
      )
      const badge = screen.getByText('Lenta')
      // Además del color (variant destructive), el texto identifica el estado
      expect(badge).toHaveAttribute('data-variant', 'destructive')
      expect(screen.queryByText('OK')).not.toBeInTheDocument()
    })
  })

  describe('when the session had no final results', () => {
    // SPEC-003 · AC-05
    it('does not show the "Latencia STT" row when latency is null', () => {
      render(<ResultSection result={stopResult(null)} onShowInFinder={vi.fn()} />)
      expect(screen.getByText(WAV_PATH)).toBeInTheDocument()
      expect(screen.queryByText('Latencia STT')).not.toBeInTheDocument()
      expect(screen.queryByText('OK')).not.toBeInTheDocument()
      expect(screen.queryByText('Lenta')).not.toBeInTheDocument()
    })
  })
})
