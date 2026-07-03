/**
 * Tests de integración de la página para SPEC-002 (transcripción). Fronteras
 * mockeadas: servicios del renderer y bridge window.api (cuyos eventos de
 * transcripción se emiten con el helper). Se monta el Toaster real de sonner
 * (como en App.tsx) para poder asertar el toast de guardado.
 */
import { act, render, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SpikeAudioCapturePage } from '@/pages/SpikeAudioCapturePage'
import {
  acquireMicrophoneStream,
  acquireSystemAudioStream,
  listAudioInputDevices
} from '@/services/captureService'
import { getPermissionsStatus } from '@/services/permissionsService'
import type { StopResult } from '@/types/audio'
import { createFakeAudioStream } from '../../helpers/fakeMediaStream'
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

const SAVED_RESULT: StopResult = {
  filePath: '/tmp/maurya-recordings/spike-test.wav',
  durationSeconds: 12,
  sizeBytes: 44 + 12 * 16000 * 4,
  sampleRate: 16000,
  channels: 2,
  transcriptPath: null
}

let mockApi: MockApiHandle

function renderPage(): RenderResult {
  return render(
    <TooltipProvider>
      <SpikeAudioCapturePage />
      <Toaster />
    </TooltipProvider>
  )
}

function setupGrantedCapture(): void {
  vi.mocked(getPermissionsStatus).mockResolvedValue({
    microphone: 'granted',
    systemAudio: 'granted'
  })
  vi.mocked(acquireMicrophoneStream).mockResolvedValue(createFakeAudioStream().stream)
  vi.mocked(acquireSystemAudioStream).mockResolvedValue(createFakeAudioStream().stream)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(listAudioInputDevices).mockResolvedValue([])
  recorderMock.start.mockResolvedValue(undefined)
  recorderMock.stop.mockResolvedValue(undefined)
  recorderMock.getLevels.mockReturnValue({ microphone: 0, system: 0 })
  vi.mocked(mockApi.api.recording.stop).mockResolvedValue(SAVED_RESULT)
})

describe('SpikeAudioCapturePage (transcription)', () => {
  describe('when no Deepgram API key is configured', () => {
    // SPEC-002 · AC-07
    it('keeps the capture running and shows an informative (non-destructive) alert with the .env.local / DEEPGRAM_API_KEY instruction', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Iniciar captura' }))
      await screen.findByRole('button', { name: 'Detener' })

      act(() => {
        mockApi.emitTranscriptionStatus({ status: 'no-key' })
      })

      // Badge de estado "Sin key" y Alert informativo con la instrucción
      expect(await screen.findByText('Sin key')).toBeInTheDocument()
      expect(screen.getByText('Falta la key de Deepgram')).toBeInTheDocument()
      expect(screen.getByText('DEEPGRAM_API_KEY')).toBeInTheDocument()
      expect(screen.getByText('.env.local')).toBeInTheDocument()

      // Alert informativo, no destructive (jsdom: se aserta por clase)
      screen.getAllByRole('alert').forEach((alert) => {
        expect(alert).not.toHaveClass('text-destructive')
      })

      // La captura arrancó y sigue en curso sin transcripción
      expect(screen.getByRole('button', { name: 'Detener' })).toBeInTheDocument()
    })
  })

  describe('when the Deepgram API key is invalid', () => {
    // SPEC-002 · AC-10
    it('shows a destructive alert "clave inválida" while the audio capture continues without transcription', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Iniciar captura' }))
      await screen.findByRole('button', { name: 'Detener' })

      act(() => {
        mockApi.emitTranscriptionStatus({
          status: 'disconnected',
          error: {
            kind: 'deepgram-auth',
            message: 'No se pudo conectar con Deepgram: clave inválida'
          }
        })
      })

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Error de conexión con Deepgram')
      expect(alert).toHaveTextContent('No se pudo conectar con Deepgram: clave inválida')
      expect(alert).toHaveClass('text-destructive')

      // El Badge refleja el estado y la captura de audio continúa
      expect(screen.getByText('Desconectado')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Detener' })).toBeInTheDocument()
    })
  })

  describe('when stopping a capture that produced a transcript', () => {
    // SPEC-002 · AC-05 (mitad renderer: feedback de persistencia al detener)
    it('shows the "Grabación y transcripción guardadas" toast when stop returns a transcript path', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      vi.mocked(mockApi.api.recording.stop).mockResolvedValue({
        ...SAVED_RESULT,
        transcriptPath: '/tmp/maurya-recordings/spike-test.transcript.json'
      })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Iniciar captura' }))
      await user.click(await screen.findByRole('button', { name: 'Detener' }))

      // sonner puede renderizar nodos duplicados del toast: query tolerante
      const toasts = await screen.findAllByText('Grabación y transcripción guardadas')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // Y la sección Resultado muestra la ruta del transcript devuelta por stop
      expect(
        screen.getByText('/tmp/maurya-recordings/spike-test.transcript.json')
      ).toBeInTheDocument()
    })
  })
})
