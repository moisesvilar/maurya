/**
 * Tests del hook useAudioCapture. Fronteras mockeadas: servicios del renderer
 * (captureService, permissionsService, wavRecorderService) y el bridge window.api.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioCapture } from '@/hooks/useAudioCapture'
import { acquireMicrophoneStream, acquireSystemAudioStream } from '@/services/captureService'
import { getPermissionsStatus } from '@/services/permissionsService'
import type { AudioLevels, StopResult } from '@/types/audio'
import { createFakeAudioStream, type FakeMediaStreamTrack } from '../../helpers/fakeMediaStream'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

vi.mock('@/services/permissionsService', () => ({
  getPermissionsStatus: vi.fn(),
  requestMicrophoneAccess: vi.fn(),
  openPrivacySettings: vi.fn()
}))

vi.mock('@/services/captureService', () => ({
  DEFAULT_DEVICE_ID: '__default__',
  acquireMicrophoneStream: vi.fn(),
  acquireSystemAudioStream: vi.fn(),
  listAudioInputDevices: vi.fn(),
  stopStream: vi.fn()
}))

const recorderMock = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  getLevels: vi.fn(),
  durationSeconds: 0
}))

vi.mock('@/services/wavRecorderService', () => ({
  CAPTURE_SAMPLE_RATE: 16000,
  WavRecorderService: class {
    start = recorderMock.start
    stop = recorderMock.stop
    getLevels = recorderMock.getLevels
    get durationSeconds(): number {
      return recorderMock.durationSeconds
    }
    get samplesWritten(): number {
      return recorderMock.durationSeconds * 16000
    }
  }
}))

// SPEC-002/003 cambiaron el contrato: recording.stop() devuelve StopResult
const SAVED_RESULT: StopResult = {
  filePath: '/tmp/maurya-recordings/spike-test.wav',
  durationSeconds: 12,
  sizeBytes: 44 + 12 * 16000 * 4,
  sampleRate: 16000,
  channels: 2,
  transcriptPath: null,
  latency: null
}

const ZERO_LEVELS: AudioLevels = { microphone: 0, system: 0 }

let mockApi: MockApiHandle

function setupGrantedCapture(): { micTrack: FakeMediaStreamTrack } {
  vi.mocked(getPermissionsStatus).mockResolvedValue({
    microphone: 'granted',
    systemAudio: 'granted'
  })
  const mic = createFakeAudioStream()
  const system = createFakeAudioStream()
  vi.mocked(acquireMicrophoneStream).mockResolvedValue(mic.stream)
  vi.mocked(acquireSystemAudioStream).mockResolvedValue(system.stream)
  return { micTrack: mic.track }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  recorderMock.start.mockResolvedValue(undefined)
  recorderMock.stop.mockResolvedValue(undefined)
  recorderMock.getLevels.mockReturnValue(ZERO_LEVELS)
  vi.mocked(mockApi.api.recording.stop).mockResolvedValue(SAVED_RESULT)
})

describe('useAudioCapture', () => {
  describe('when the user stops an ongoing capture', () => {
    // SPEC-001 · AC-04
    it('finalizes the recording, exposes the result with total duration and file path, and notifies onSaved', async () => {
      setupGrantedCapture()
      const onSaved = vi.fn()
      const { result } = renderHook(() => useAudioCapture(onSaved))

      await act(async () => {
        await result.current.start('__default__')
      })
      expect(result.current.status).toBe('recording')

      let saved: StopResult | null = null
      await act(async () => {
        saved = await result.current.stop()
      })

      expect(saved).toEqual(SAVED_RESULT)
      expect(result.current.result).toEqual(SAVED_RESULT)
      expect(result.current.result?.filePath).toBe('/tmp/maurya-recordings/spike-test.wav')
      expect(result.current.result?.durationSeconds).toBe(12)
      expect(result.current.status).toBe('idle')
      expect(result.current.error).toBeNull()
      expect(vi.mocked(mockApi.api.recording.stop)).toHaveBeenCalledTimes(1)
      expect(onSaved).toHaveBeenCalledTimes(1)
      expect(onSaved).toHaveBeenCalledWith(SAVED_RESULT)
    })
  })

  describe('when the selected input device disconnects during capture', () => {
    // SPEC-001 · AC-13
    it('stops in a controlled way, keeps what was recorded so far and reports a device-disconnected error without calling onSaved', async () => {
      const { micTrack } = setupGrantedCapture()
      const onSaved = vi.fn()
      const { result } = renderHook(() => useAudioCapture(onSaved))

      await act(async () => {
        await result.current.start('__default__')
      })
      expect(result.current.status).toBe('recording')

      act(() => {
        micTrack.disconnect()
      })

      await waitFor(() => {
        expect(result.current.error?.kind).toBe('device-disconnected')
      })
      expect(result.current.error?.message).toBe(
        'El dispositivo de entrada se ha desconectado. La captura se ha detenido y se ha conservado lo grabado hasta ese momento.'
      )
      // Lo grabado hasta el momento se conserva: el archivo quedó finalizado
      expect(vi.mocked(mockApi.api.recording.stop)).toHaveBeenCalledTimes(1)
      expect(result.current.result).toEqual(SAVED_RESULT)
      expect(result.current.status).toBe('idle')
      // La detención por error no dispara el toast de guardado
      expect(onSaved).not.toHaveBeenCalled()
    })
  })
})
