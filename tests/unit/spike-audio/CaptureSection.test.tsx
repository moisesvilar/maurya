/**
 * Tests de CaptureSection: formato del cronómetro (presentacional puro).
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CaptureSection } from '@/components/spike/CaptureSection'
import type { AudioLevels } from '@/types/audio'

const LEVELS: AudioLevels = { microphone: 0, system: 0 }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CaptureSection', () => {
  describe('when the capture is running', () => {
    // SPEC-001 · AC-05
    it('shows the elapsed time chronometer formatted as mm:ss with zero padding', () => {
      const noop = vi.fn()
      const { rerender } = render(
        <CaptureSection
          status="recording"
          elapsedSeconds={0}
          levels={LEVELS}
          onStart={noop}
          onStop={noop}
        />
      )
      expect(screen.getByText('00:00')).toBeInTheDocument()

      rerender(
        <CaptureSection
          status="recording"
          elapsedSeconds={5}
          levels={LEVELS}
          onStart={noop}
          onStop={noop}
        />
      )
      expect(screen.getByText('00:05')).toBeInTheDocument()

      rerender(
        <CaptureSection
          status="recording"
          elapsedSeconds={65}
          levels={LEVELS}
          onStart={noop}
          onStop={noop}
        />
      )
      expect(screen.getByText('01:05')).toBeInTheDocument()

      // 12 min 34 s — el bloque de minutos crece más allá de una cifra
      rerender(
        <CaptureSection
          status="recording"
          elapsedSeconds={754}
          levels={LEVELS}
          onStart={noop}
          onStop={noop}
        />
      )
      expect(screen.getByText('12:34')).toBeInTheDocument()
    })
  })
})
