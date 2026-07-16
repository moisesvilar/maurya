/**
 * Tests de la sección Grabación del detalle de entrevista (SPEC-015).
 * Montada vía InterviewDetailPage con rutas reales; fronteras de mocking:
 * servicios del spike (permissionsService/captureService/wavRecorderService,
 * patrón SPEC-001) + bridge window.api.
 * Lecciones aplicadas: "Micrófono" aparece ×2-3 (LevelMeter, MicSelect,
 * TranscriptLine) → roles/getAllBy, nunca getByText a secas; sonner tolerante;
 * máx 1 tooltip hover por render; esperar estados habilitados antes de click.
 * SPEC-019: "Iniciar grabación" abre primero el aviso de consentimiento
 * (AlertDialog modal) — todo arranque de grabación lo atraviesa confirmando
 * "Entendido, iniciar grabación" (ver startRecording).
 */
import { act, render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { InterviewDetailPage } from '@/pages/InterviewDetailPage'
import {
  acquireMicrophoneStream,
  acquireSystemAudioStream,
  listAudioInputDevices
} from '@/services/captureService'
import { getPermissionsStatus } from '@/services/permissionsService'
import type { LatencyStats, StopResult } from '@/types/audio'
import type { Company, Interview } from '@/types/domain'
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

let mockApi: MockApiHandle

const COMPANY: Company = {
  id: 'c-1',
  name: 'Acme Corp',
  website: null,
  linkedinUrl: null,
  createdAt: '2026-07-02T12:00:00.000Z',
  updatedAt: '2026-07-02T12:00:00.000Z'
}

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: 'i-1',
    // SPEC-020 (schema v2): toda entrevista ancla su discovery directamente.
    discoveryId: 'd-1',
    companyId: 'c-1',
    contactIds: [],
    interviewGroupId: null,
    templateId: null,
    title: 'Discovery con Acme',
    status: 'draft',
    scriptMarkdown: null,
    objectives: [],
    wavPath: null,
    transcriptPath: null,
    createdAt: '2026-07-04T10:00:00.000Z',
    updatedAt: '2026-07-04T10:00:00.000Z',
    ...overrides
  }
}

const WAV_PATH = '/tmp/maurya-recordings/entrevista-i-1.wav'
const TRANSCRIPT_PATH = '/tmp/maurya-recordings/entrevista-i-1.transcript.json'

const RECORDED = interview({
  wavPath: WAV_PATH,
  transcriptPath: TRANSCRIPT_PATH,
  status: 'recorded'
})

const STATS: LatencyStats = { count: 14, p50Ms: 1200, p95Ms: 2800, maxMs: 3100 }

const STOP_RESULT: StopResult = {
  filePath: WAV_PATH,
  durationSeconds: 95,
  sizeBytes: 44 + 95 * 16000 * 4,
  sampleRate: 16000,
  channels: 2,
  transcriptPath: TRANSCRIPT_PATH,
  latency: STATS,
  interview: RECORDED
}

function setInterview(value: Interview): void {
  vi.mocked(mockApi.api.db.getInterview).mockResolvedValue({ ok: true, data: value })
}

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

function renderDetail(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/discoveries/d-1/companies/c-1/interviews/i-1']}>
        <Routes>
          <Route
            path="/discoveries/:discoveryId/companies/:companyId"
            element={<CompanyDetailPage />}
          />
          <Route
            path="/discoveries/:discoveryId/companies/:companyId/interviews/:interviewId"
            element={<InterviewDetailPage />}
          />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/**
 * Espera la preparación y arranca la grabación atravesando el aviso de
 * consentimiento (SPEC-019): "Iniciar grabación" abre el AlertDialog "Aviso
 * de grabación" (modal: el fondo queda aria-hidden) y la captura solo arranca
 * tras "Entendido, iniciar grabación". La casilla queda sin marcar: no se
 * persiste ninguna preferencia entre tests.
 */
async function startRecording(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Iniciar grabación' }))
  const consent = await screen.findByRole('alertdialog')
  expect(within(consent).getByRole('heading', { name: 'Aviso de grabación' })).toBeInTheDocument()
  await user.click(within(consent).getByRole('button', { name: 'Entendido, iniciar grabación' }))
  await screen.findByRole('button', { name: 'Detener' })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Aislamiento del aviso de consentimiento (SPEC-019): sin preferencia
  // 'maurya:recording-consent-dismissed' persistida entre tests
  window.localStorage.clear()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
  setInterview(interview())
  // Sin Alert de clave en ScriptSection para no colisionar con los role=alert
  vi.mocked(mockApi.api.llm.getStatus).mockResolvedValue({
    ok: true,
    data: { hasAnthropicKey: true }
  })
  vi.mocked(listAudioInputDevices).mockResolvedValue([])
  vi.mocked(getPermissionsStatus).mockResolvedValue({
    microphone: 'granted',
    systemAudio: 'granted'
  })
  recorderMock.start.mockResolvedValue(undefined)
  recorderMock.stop.mockResolvedValue(undefined)
  recorderMock.getLevels.mockReturnValue({ microphone: 42, system: 17 })
  vi.mocked(mockApi.api.recording.stop).mockResolvedValue({
    ...STOP_RESULT,
    interview: null,
    latency: null,
    transcriptPath: null
  })
})

describe('RecordingSection', () => {
  describe('preparation', () => {
    // SPEC-015 · AC-01
    it('shows the permission badges, the microphone select and the "Iniciar grabación" button', async () => {
      renderDetail()

      expect(await screen.findByRole('heading', { name: 'Grabación' })).toBeInTheDocument()
      expect(await screen.findAllByText('Concedido')).toHaveLength(2)
      expect(screen.getByText('Audio del sistema')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Micrófono' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Iniciar grabación' })).toBeInTheDocument()
    })

    // SPEC-015 · AC-02
    it('does not start and shows the destructive alert with the spike literal when a permission is denied', async () => {
      const user = userEvent.setup()
      vi.mocked(getPermissionsStatus).mockResolvedValue({
        microphone: 'denied',
        systemAudio: 'granted'
      })
      renderDetail()

      await user.click(await screen.findByRole('button', { name: 'Iniciar grabación' }))
      // SPEC-019: el aviso de consentimiento aparece ANTES de cualquier
      // intento de captura; el bloqueo por permisos se evalúa tras confirmar
      const consent = await screen.findByRole('alertdialog')
      await user.click(
        within(consent).getByRole('button', { name: 'Entendido, iniciar grabación' })
      )

      const title = await screen.findByText('Permiso de micrófono no concedido')
      const alert = title.closest('[role="alert"]')
      if (alert === null) {
        throw new Error('El error de permiso debe mostrarse dentro de un Alert')
      }
      expect(alert).toHaveTextContent(/Ajustes del Sistema → Privacidad y seguridad → Micrófono/)
      // No arranca: sin Detener ni recorder ni bridge
      expect(screen.queryByRole('button', { name: 'Detener' })).not.toBeInTheDocument()
      expect(recorderMock.start).not.toHaveBeenCalled()
      expect(vi.mocked(mockApi.api.recording.start)).not.toHaveBeenCalled()
    })

    // SPEC-015 · AC-03
    it('disables the microphone select with a tooltip while recording', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderDetail()
      await startRecording(user)

      const select = screen.getByRole('combobox', { name: 'Micrófono' })
      expect(select).toBeDisabled()
      const wrapper = select.parentElement
      if (wrapper === null) {
        throw new Error('El Select deshabilitado debe estar envuelto por el TooltipTrigger')
      }
      await user.hover(wrapper)
      expect(
        (await screen.findAllByText('No se puede cambiar de dispositivo durante la captura')).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  describe('recording', () => {
    // SPEC-015 · AC-04
    it('starts the capture associated to the interview showing chronometer, both meters and a destructive Detener', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderDetail()

      await startRecording(user)

      // La asociación viaja en recording:start con el id de la entrevista Y el
      // timestamp del consentimiento (SPEC-019: se registra en transcript.json)
      expect(vi.mocked(mockApi.api.recording.start)).toHaveBeenCalledWith(
        'i-1',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      )
      const consentAcknowledgedAt = vi.mocked(mockApi.api.recording.start).mock.calls[0][1]
      if (consentAcknowledgedAt === undefined) {
        throw new Error('recording.start debe recibir el timestamp del consentimiento (SPEC-019)')
      }
      // ISO 8601 real (round-trip exacto), no solo con forma de fecha
      expect(new Date(consentAcknowledgedAt).toISOString()).toBe(consentAcknowledgedAt)
      expect(recorderMock.start).toHaveBeenCalledTimes(1)
      expect(screen.getByText('00:00')).toBeInTheDocument()
      expect(screen.getAllByRole('progressbar')).toHaveLength(2)
      expect(screen.getByLabelText('Nivel de Micrófono')).toBeInTheDocument()
      expect(screen.getByLabelText('Nivel de Sistema')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Detener' })).toHaveAttribute(
        'data-variant',
        'destructive'
      )
    })

    // SPEC-015 · AC-05
    it('stops associating wav/transcript to the interview, flips the badge to "Grabada" and toasts "Grabación guardada"', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      vi.mocked(mockApi.api.recording.stop).mockResolvedValue(STOP_RESULT)
      renderDetail()
      await startRecording(user)

      await user.click(screen.getByRole('button', { name: 'Detener' }))

      const toasts = await screen.findAllByText('Grabación guardada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // La Interview asociada por main actualiza el Badge de la cabecera
      expect(await screen.findByText('Grabada')).toBeInTheDocument()
      // Estado 3: resumen con duración (recién grabado) y rutas
      expect(await screen.findByText(WAV_PATH)).toBeInTheDocument()
      expect(screen.getByText(TRANSCRIPT_PATH)).toBeInTheDocument()
      expect(screen.getByText('Duración')).toBeInTheDocument()
      expect(screen.getByText('01:35')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Nueva grabación' })).toBeInTheDocument()
    })

    // SPEC-015 · AC-06
    it('auto-stops and saves when navigating away from the detail during a recording', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      vi.mocked(mockApi.api.recording.stop).mockResolvedValue(STOP_RESULT)
      renderDetail()
      await startRecording(user)

      // Navegar fuera (Volver al detalle de la empresa) desmonta la sección
      await user.click(screen.getByRole('button', { name: 'Volver' }))
      await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })

      // El cleanup detiene y guarda sin diálogo (la asociación ocurre en main)
      await waitFor(() => expect(vi.mocked(mockApi.api.recording.stop)).toHaveBeenCalledTimes(1))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    // SPEC-015 · AC-07
    it('keeps the spike close guard: closing the app during a recording opens the "Detener captura" dialog', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitCloseRequested()
      })

      expect(await screen.findByRole('heading', { name: 'Detener captura' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Detener y guardar' })).toBeInTheDocument()
    })

    // SPEC-015 · AC-08 (camino finalize del spike: ver también SPEC-001 AC-13)
    it('stops in a controlled way on device disconnection, keeping the recording associated and showing the cause', async () => {
      const user = userEvent.setup()
      const { micTrack } = setupGrantedCapture()
      vi.mocked(mockApi.api.recording.stop).mockResolvedValue(STOP_RESULT)
      renderDetail()
      await startRecording(user)

      act(() => {
        micTrack.disconnect()
      })

      // Alert de causa (literal del spike) y asociación conservada (Badge Grabada)
      const title = await screen.findByText('Dispositivo desconectado')
      expect(title.closest('[role="alert"]')).not.toBeNull()
      expect(vi.mocked(mockApi.api.recording.stop)).toHaveBeenCalledTimes(1)
      expect(await screen.findByText('Grabada')).toBeInTheDocument()
      expect(await screen.findByText(WAV_PATH)).toBeInTheDocument()
    })
  })

  describe('live transcription', () => {
    // SPEC-015 · AC-09
    it('shows live lines with source badge and speaker label plus the "Transcribiendo" status badge', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitTranscriptionStatus({ status: 'active' })
        mockApi.emitTranscriptionResult({
          channel: 'mic',
          text: 'Ya validamos el problema del registro manual',
          startMs: 1000,
          endMs: 2600,
          receivedAtMs: 2700,
          isFinal: true,
          speaker: 0,
          offsetSeconds: 1
        })
      })

      expect(await screen.findByText('Transcribiendo')).toBeInTheDocument()
      expect(screen.getByText('Ya validamos el problema del registro manual')).toBeInTheDocument()
      expect(screen.getByText('Hablante 1')).toBeInTheDocument()
    })

    // SPEC-015 · AC-10
    it('keeps recording without transcription showing the no-key informative alert', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitTranscriptionStatus({ status: 'no-key' })
      })

      expect(await screen.findByText('Falta la key de Deepgram')).toBeInTheDocument()
      expect(screen.getByText('Sin key')).toBeInTheDocument()
      // La grabación sigue operativa: cronómetro y Detener presentes
      expect(screen.getByText('00:00')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Detener' })).toBeInTheDocument()
    })
  })

  describe('after recording', () => {
    // SPEC-015 · AC-11
    it('shows the summary with paths, the latency row and a working "Mostrar en Finder"', async () => {
      const user = userEvent.setup()
      setInterview(RECORDED)
      vi.mocked(mockApi.api.recording.getTranscriptStats).mockResolvedValue(STATS)
      renderDetail()

      expect(await screen.findByText(WAV_PATH)).toBeInTheDocument()
      expect(screen.getByText(TRANSCRIPT_PATH)).toBeInTheDocument()
      expect(await screen.findByText('Latencia STT')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Mostrar en Finder' }))
      expect(vi.mocked(mockApi.api.recording.showInFinder)).toHaveBeenCalledWith(WAV_PATH)
    })

    // SPEC-015 · AC-12
    it('asks to overwrite in the "Sobrescribir grabación" dialog and returns to preparation on confirm', async () => {
      const user = userEvent.setup()
      setInterview(RECORDED)
      renderDetail()

      await user.click(await screen.findByRole('button', { name: 'Nueva grabación' }))

      const dialog = await screen.findByRole('alertdialog')
      expect(
        within(dialog).getByRole('heading', { name: 'Sobrescribir grabación' })
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText('La grabación y transcripción actuales se sustituirán.')
      ).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Sobrescribir' }))

      // Vuelta al Estado 1: permisos + Iniciar grabación
      expect(await screen.findByRole('button', { name: 'Iniciar grabación' })).toBeInTheDocument()
      expect(await screen.findAllByText('Concedido')).toHaveLength(2)
      expect(screen.queryByText(WAV_PATH)).not.toBeInTheDocument()
    })

    // SPEC-015 · AC-13 (recarga: montaje directo con la entrevista grabada)
    it('restores the persisted summary after a reload, reading the latency from the transcript file', async () => {
      setInterview(RECORDED)
      vi.mocked(mockApi.api.recording.getTranscriptStats).mockResolvedValue(STATS)
      renderDetail()

      expect(await screen.findByText('Latencia STT')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.recording.getTranscriptStats)).toHaveBeenCalledWith(
        TRANSCRIPT_PATH
      )
      expect(
        screen.getByText('mediana 1,2 s · p95 2,8 s · máx 3,1 s · 14 resultados')
      ).toBeInTheDocument()
      expect(screen.getByText('OK')).toBeInTheDocument()
      expect(screen.getByText(WAV_PATH)).toBeInTheDocument()
    })
  })

  describe('script visibility', () => {
    // SPEC-015 · AC-14
    it('keeps the Guión section visible and readable while the recording is running', async () => {
      const user = userEvent.setup()
      setInterview(
        interview({
          templateId: 'tpl-1',
          scriptMarkdown: '# Guión adaptado\nPregunta clave para la llamada',
          objectives: ['Objetivo A'],
          status: 'prepared'
        })
      )
      setupGrantedCapture()
      renderDetail()
      await startRecording(user)

      // Coexistencia: cronómetro de grabación + guión legible en la misma página.
      // SPEC-025: los objetivos viven en la sección superior única (h3).
      // SPEC-042 (adaptación): el bloque de EDICIÓN de objetivos (h4) dentro
      // del Guión queda derogado — la sección fusionada es la superficie única.
      expect(screen.getByText('00:00')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Guión' })).toBeInTheDocument()
      expect(screen.getByText(/Pregunta clave para la llamada/)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Objetivos', level: 3 })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Objetivos', level: 4 })).not.toBeInTheDocument()
    })
  })
})
