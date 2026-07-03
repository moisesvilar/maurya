/**
 * Tests de integración de la página del spike. Fronteras mockeadas: servicios
 * del renderer (permissionsService, captureService, wavRecorderService) y el
 * bridge window.api. Hooks propios y componentes shadcn se ejecutan reales.
 */
import { act, render, screen, waitFor, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SpikeAudioCapturePage } from '@/pages/SpikeAudioCapturePage'
import {
  acquireMicrophoneStream,
  acquireSystemAudioStream,
  listAudioInputDevices
} from '@/services/captureService'
import { getPermissionsStatus, requestMicrophoneAccess } from '@/services/permissionsService'
import type { AudioLevels, StopResult } from '@/types/audio'
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

const ACTIVE_LEVELS: AudioLevels = { microphone: 42, system: 17 }

let mockApi: MockApiHandle

function renderPage(): RenderResult {
  return render(
    <TooltipProvider>
      <SpikeAudioCapturePage />
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
  recorderMock.getLevels.mockReturnValue(ACTIVE_LEVELS)
  vi.mocked(mockApi.api.recording.stop).mockResolvedValue(SAVED_RESULT)
})

describe('SpikeAudioCapturePage', () => {
  describe('when both permissions are granted', () => {
    // SPEC-001 · AC-01
    it('starts capturing both sources and renders the two live level meters when the user clicks "Iniciar captura"', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Iniciar captura' }))

      // Transición de estado: el botón primario pasa a "Detener"
      expect(await screen.findByRole('button', { name: 'Detener' })).toBeInTheDocument()
      expect(recorderMock.start).toHaveBeenCalledTimes(1)
      expect(vi.mocked(mockApi.api.recording.start)).toHaveBeenCalledTimes(1)

      // Dos medidores de nivel etiquetados por fuente
      expect(screen.getAllByRole('progressbar')).toHaveLength(2)
      expect(screen.getByLabelText('Nivel de Micrófono')).toBeInTheDocument()
      expect(screen.getByLabelText('Nivel de Sistema')).toBeInTheDocument()

      // Los medidores reflejan actividad (valores que reporta el recorder)
      await waitFor(() => {
        expect(screen.getByText('42%')).toBeInTheDocument()
        expect(screen.getByText('17%')).toBeInTheDocument()
      })
    })

    // SPEC-001 · AC-09
    it('calls window.api.recording.showInFinder with the recording path when "Mostrar en Finder" is clicked', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Iniciar captura' }))
      await user.click(await screen.findByRole('button', { name: 'Detener' }))

      // La sección Resultado aparece tras detener, con la ruta del archivo
      expect(await screen.findByText(SAVED_RESULT.filePath)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Mostrar en Finder' }))

      expect(vi.mocked(mockApi.api.recording.showInFinder)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(mockApi.api.recording.showInFinder)).toHaveBeenCalledWith(
        SAVED_RESULT.filePath
      )
    })

    // SPEC-001 · AC-14
    it('shows the "Detener captura" AlertDialog when the window close is requested during capture, with cancel and stop-and-save actions', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Iniciar captura' }))
      await screen.findByRole('button', { name: 'Detener' })

      act(() => {
        mockApi.emitCloseRequested()
      })

      // El título del AlertDialog sí es un heading (a diferencia de los Card)
      expect(await screen.findByRole('heading', { name: 'Detener captura' })).toBeInTheDocument()
      expect(
        screen.getByText('La grabación en curso se detendrá y se guardará lo capturado.')
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Detener y guardar' }))

      await waitFor(() => {
        expect(vi.mocked(mockApi.api.recording.stop)).toHaveBeenCalledTimes(1)
        expect(vi.mocked(mockApi.api.window.confirmClose)).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('when the microphone permission is denied', () => {
    // SPEC-001 · AC-10
    it('shows a destructive alert with the microphone settings instruction and does not start the capture', async () => {
      const user = userEvent.setup()
      vi.mocked(getPermissionsStatus).mockResolvedValue({
        microphone: 'denied',
        systemAudio: 'granted'
      })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Iniciar captura' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Permiso de micrófono no concedido')
      expect(alert).toHaveTextContent(/Ajustes del Sistema → Privacidad y seguridad → Micrófono/)
      // La captura no arranca
      expect(screen.queryByRole('button', { name: 'Detener' })).not.toBeInTheDocument()
      expect(recorderMock.start).not.toHaveBeenCalled()
      expect(vi.mocked(mockApi.api.recording.start)).not.toHaveBeenCalled()
      expect(vi.mocked(acquireMicrophoneStream)).not.toHaveBeenCalled()
    })
  })

  describe('when the system audio permission is denied', () => {
    // SPEC-001 · AC-11
    it('shows a destructive alert with the screen-and-system-audio settings instruction and does not start the capture', async () => {
      const user = userEvent.setup()
      vi.mocked(getPermissionsStatus).mockResolvedValue({
        microphone: 'granted',
        systemAudio: 'denied'
      })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Iniciar captura' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Permiso de audio del sistema no concedido')
      expect(alert).toHaveTextContent(
        /Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla y audio del sistema/
      )
      // La captura no arranca
      expect(screen.queryByRole('button', { name: 'Detener' })).not.toBeInTheDocument()
      expect(recorderMock.start).not.toHaveBeenCalled()
      expect(vi.mocked(mockApi.api.recording.start)).not.toHaveBeenCalled()
    })
  })

  describe('when the page loads', () => {
    // SPEC-001 · AC-12
    it('shows the current state of each permission as a badge without triggering any permission prompt', async () => {
      vi.mocked(getPermissionsStatus).mockResolvedValue({
        microphone: 'granted',
        systemAudio: 'not-determined'
      })
      renderPage()

      // Badge verde para el permiso concedido, rojo para el no concedido
      expect(await screen.findByText('Concedido')).toBeInTheDocument()
      expect(screen.getByText('No concedido')).toBeInTheDocument()
      // "Micrófono" también es el label de Configuración: query no-única a propósito
      expect(screen.getAllByText('Micrófono').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Audio del sistema')).toBeInTheDocument()

      // Consultar el estado no dispara ningún prompt TCC
      expect(vi.mocked(getPermissionsStatus)).toHaveBeenCalled()
      expect(vi.mocked(requestMicrophoneAccess)).not.toHaveBeenCalled()
      expect(vi.mocked(mockApi.api.permissions.requestMicrophone)).not.toHaveBeenCalled()
    })
  })
})
