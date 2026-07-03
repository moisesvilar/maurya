/**
 * Tests del hook useTranscription (SPEC-002). Frontera de mocking: el bridge
 * window.api.transcription, cuyos eventos se emiten con el helper mockApi.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTranscription } from '@/hooks/useTranscription'
import type { TranscriptResultEvent } from '@/types/audio'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

function resultEvent(overrides: Partial<TranscriptResultEvent>): TranscriptResultEvent {
  return {
    channel: 'mic',
    text: '',
    startMs: 1000,
    endMs: 2000,
    receivedAtMs: 2100,
    isFinal: false,
    offsetSeconds: 1,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
})

describe('useTranscription', () => {
  describe('when partial and final results arrive from main', () => {
    // SPEC-002 · AC-01
    it('shows the in-progress partial per channel and consolidates it as a final line when the phrase ends', () => {
      const { result } = renderHook(() => useTranscription())

      // Parcial mientras el usuario habla: visible como parcial, sin línea final
      act(() => {
        mockApi.emitTranscriptionResult(resultEvent({ text: 'hola', isFinal: false }))
      })
      expect(result.current.partials.mic).toBe('hola')
      expect(result.current.partials.system).toBe('')
      expect(result.current.lines).toHaveLength(0)

      // El parcial se va actualizando con la frase en curso
      act(() => {
        mockApi.emitTranscriptionResult(resultEvent({ text: 'hola qué tal', isFinal: false }))
      })
      expect(result.current.partials.mic).toBe('hola qué tal')

      // Al terminar la frase llega el final: se consolida como línea y limpia el parcial
      act(() => {
        mockApi.emitTranscriptionResult(
          resultEvent({
            text: 'Hola, ¿qué tal?',
            isFinal: true,
            startMs: 1000,
            endMs: 2600,
            receivedAtMs: 2700,
            offsetSeconds: 1
          })
        )
      })
      expect(result.current.partials.mic).toBe('')
      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0]).toEqual({
        channel: 'mic',
        text: 'Hola, ¿qué tal?',
        startMs: 1000,
        endMs: 2600,
        receivedAtMs: 2700,
        offsetSeconds: 1
      })

      // reset() (al iniciar una captura nueva) limpia todo el estado
      act(() => {
        result.current.reset()
      })
      expect(result.current.lines).toHaveLength(0)
      expect(result.current.partials).toEqual({ mic: '', system: '' })
      expect(result.current.status).toBe('inactive')
      expect(result.current.error).toBeNull()
    })
  })
})
