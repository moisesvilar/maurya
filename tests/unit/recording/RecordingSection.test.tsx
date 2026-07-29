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
import { Layout } from '@/components/layout/Layout'
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
import { expandTechInfo } from '../../helpers/recordingTechInfo'

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

/**
 * Extensión de SPEC-034 a la entrevista clásica: la sesión en vivo sube a la
 * top bar mientras se graba (portal al slot del Layout). Por eso el arnés monta
 * las rutas BAJO <Layout/> — sin él, TopBarSlotContext es null y el portal es
 * no-op, y estos ACs viven precisamente en la top bar (patrón
 * CaptureDetailPage.recordingControls.test.tsx).
 */
function renderDetail(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/discoveries/d-1/companies/c-1/interviews/i-1']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* SPEC-048: el back «Volver» de una entrevista sin grupo navega al
                detalle GLOBAL de la empresa (deroga la ruta anidada de SPEC-013) */}
            <Route path="companies/:companyId" element={<CompanyDetailPage />} />
            <Route
              path="discoveries/:discoveryId/companies/:companyId/interviews/:interviewId"
              element={<InterviewDetailPage />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/** El banner de la top bar (donde vive la sesión en vivo mientras se graba). */
function topBar(): HTMLElement {
  return screen.getByRole('banner')
}

/** Los controles compactos de la sesión en vivo dentro de la top bar. */
function topBarRecordingControls(): HTMLElement {
  return within(topBar()).getByTestId('topbar-recording-controls')
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
    // SPEC-015 · AC-01 (SPEC-055: badges y micro en la top bar; «Iniciar
    // grabación» en la cabecera; sin sección «Grabación» en el cuerpo)
    it('shows the permission badges and mic select in the top bar and the "Iniciar grabación" button in the header', async () => {
      renderDetail()

      const controls = await within(topBar()).findByTestId('topbar-capture-controls')
      expect(await within(controls).findAllByText('Concedido')).toHaveLength(2)
      expect(within(controls).getByText('Audio del sistema')).toBeInTheDocument()
      expect(within(controls).getByRole('combobox', { name: 'Micrófono' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Iniciar grabación' })).toBeInTheDocument()
      // SPEC-055: no hay heading ni sección «Grabación» en el cuerpo
      expect(screen.queryByRole('heading', { name: 'Grabación' })).not.toBeInTheDocument()
    })

    // SPEC-015 · AC-02 (derogado por SPEC-055-iter-1: sin permiso, «Iniciar
    // grabación» está DISABLED en la top bar — ya no se pulsa para provocar el
    // Alert; el bloqueo es preventivo, con «Abrir Ajustes» a la vista)
    it('disables "Iniciar grabación" and shows "Abrir Ajustes del Sistema" when a permission is denied', async () => {
      vi.mocked(getPermissionsStatus).mockResolvedValue({
        microphone: 'denied',
        systemAudio: 'granted'
      })
      renderDetail()

      const controls = await within(topBar()).findByTestId('topbar-capture-controls')
      expect(
        await within(controls).findByRole('button', { name: 'Iniciar grabación' })
      ).toBeDisabled()
      expect(within(controls).getByTestId('open-settings-button')).toBeInTheDocument()
      // No arranca: sin Detener ni recorder ni bridge
      expect(screen.queryByRole('button', { name: 'Detener' })).not.toBeInTheDocument()
      expect(recorderMock.start).not.toHaveBeenCalled()
      expect(vi.mocked(mockApi.api.recording.start)).not.toHaveBeenCalled()
    })

    // SPEC-055-iter-2 · AC-01/AC-02: pendiente (not-determined) NO bloquea — el
    // primer clic en «Iniciar grabación» es lo que dispara los prompts TCC; sin
    // botones correctivos (no hay fila en Ajustes ni entrada TCC que resetear)
    it('enables "Iniciar grabación" and hides the corrective buttons while permissions are pending', async () => {
      vi.mocked(getPermissionsStatus).mockResolvedValue({
        microphone: 'not-determined',
        systemAudio: 'not-determined'
      })
      renderDetail()

      const controls = await within(topBar()).findByTestId('topbar-capture-controls')
      expect(
        await within(controls).findByRole('button', { name: 'Iniciar grabación' })
      ).toBeEnabled()
      expect(within(controls).getByTestId('permission-badge-microphone')).toHaveAttribute(
        'data-state',
        'pending'
      )
      expect(within(controls).queryByTestId('open-settings-button')).not.toBeInTheDocument()
      expect(within(controls).queryByTestId('mic-workaround-button')).not.toBeInTheDocument()
    })

    // SPEC-015 · AC-03 (SPEC-055-iter-1: el selector de micrófono sigue en la
    // top bar durante la grabación, pero DISABLED — no se cambia de dispositivo
    // en caliente; el slot no salta entre estados)
    it('keeps the microphone select present but disabled while recording', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderDetail()
      await startRecording(user)

      const controls = topBarRecordingControls()
      expect(within(controls).getByRole('button', { name: 'Detener' })).toBeInTheDocument()
      // El selector sigue presente pero disabled durante la grabación
      expect(within(controls).getByRole('combobox', { name: 'Micrófono' })).toBeDisabled()
      expect(screen.queryByRole('heading', { name: 'Grabación' })).not.toBeInTheDocument()
    })
  })

  describe('recording', () => {
    // SPEC-015 · AC-04 (extensión de SPEC-034: cronómetro, medidores y Detener
    // viven en la top bar, no en el cuerpo)
    it('starts the capture associated to the interview showing chronometer, both meters and a destructive Detener in the top bar', async () => {
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
      // La sesión en vivo compacta vive en la top bar (topbar-recording-controls)
      const controls = topBarRecordingControls()
      expect(within(controls).getByText('00:00')).toBeInTheDocument()
      expect(within(controls).getAllByRole('progressbar')).toHaveLength(2)
      expect(within(controls).getByLabelText('Nivel de Micrófono')).toBeInTheDocument()
      expect(within(controls).getByLabelText('Nivel de Sistema')).toBeInTheDocument()
      expect(within(controls).getByRole('button', { name: 'Detener' })).toHaveAttribute(
        'data-variant',
        'destructive'
      )
      // Y ya no hay sección «Grabación» en el cuerpo mientras se graba
      expect(screen.queryByRole('heading', { name: 'Grabación' })).not.toBeInTheDocument()
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
      // SPEC-055-iter-1: estado Grabada — la etiqueta «Grabada» (SIN duración) +
      // «Nueva grabación» viven en la top bar; las rutas en la superficie
      const recordedControls = await within(topBar()).findByTestId('topbar-recorded-controls')
      expect(within(recordedControls).getByText('Grabada')).toBeInTheDocument()
      expect(
        within(recordedControls).getByRole('button', { name: 'Nueva grabación' })
      ).toBeInTheDocument()
      expect(within(recordedControls).queryByText(/01:35/)).not.toBeInTheDocument()
      // SPEC-059: las rutas ya no están bajo la cabecera — viven al final, tras
      // el desplegable «Mostrar información técnica de la grabación»
      const techInfo = await expandTechInfo(user)
      expect(within(techInfo).getByText(WAV_PATH)).toBeInTheDocument()
      expect(within(techInfo).getByText(TRANSCRIPT_PATH)).toBeInTheDocument()
      expect(screen.queryByText('Duración')).not.toBeInTheDocument()
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

      // Alert de causa (literal del spike) y asociación conservada (estado Grabada)
      const title = await screen.findByText('Dispositivo desconectado')
      expect(title.closest('[role="alert"]')).not.toBeNull()
      expect(vi.mocked(mockApi.api.recording.stop)).toHaveBeenCalledTimes(1)
      // SPEC-055-iter-1: el estado Grabada se acredita por sus controles en la
      // top bar (la etiqueta «Grabada» coexiste con el Badge de la cabecera)
      expect(await within(topBar()).findByTestId('topbar-recorded-controls')).toBeInTheDocument()
      // SPEC-059: la ruta del WAV vive tras el desplegable del final
      expect(within(await expandTechInfo(user)).getByText(WAV_PATH)).toBeInTheDocument()
    })
  })

  describe('live transcription', () => {
    // SPEC-015 · AC-09 (SPEC-055-iter-1: se retira el badge de estado
    // «Transcribiendo» de la top bar; la línea en vivo tampoco se pinta —
    // paridad con la captura, SPEC-035)
    it('does not show the "Transcribiendo" status badge in the top bar and renders no live transcript lines', async () => {
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

      const controls = topBarRecordingControls()
      // La sesión sigue viva (Detener) pero sin badge de estado de transcripción
      expect(within(controls).getByRole('button', { name: 'Detener' })).toBeInTheDocument()
      expect(within(controls).queryByText('Transcribiendo')).not.toBeInTheDocument()
      // …y la línea en vivo ya no se pinta en ninguna parte del cuerpo
      expect(
        screen.queryByText('Ya validamos el problema del registro manual')
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Hablante 1')).not.toBeInTheDocument()
    })

    // SPEC-015 · AC-10 (SPEC-055-iter-1: sin badge «Sin key» en la top bar; el
    // aviso «Falta la key» sigue en la superficie bajo la cabecera)
    it('keeps recording without transcription showing the no-key informative alert below the header', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitTranscriptionStatus({ status: 'no-key' })
      })

      // El aviso informativo sigue anclado bajo la cabecera
      expect(await screen.findByText('Falta la key de Deepgram')).toBeInTheDocument()
      // La sesión sigue operativa en la top bar (cronómetro + Detener), sin
      // badge de estado «Sin key» (retirado en iter-1)
      const controls = topBarRecordingControls()
      expect(within(controls).queryByText('Sin key')).not.toBeInTheDocument()
      expect(within(controls).getByText('00:00')).toBeInTheDocument()
      expect(within(controls).getByRole('button', { name: 'Detener' })).toBeInTheDocument()
    })
  })

  describe('after recording', () => {
    // SPEC-015 · AC-11
    it('shows the summary with paths, the latency row and a working "Mostrar en Finder"', async () => {
      const user = userEvent.setup()
      setInterview(RECORDED)
      vi.mocked(mockApi.api.recording.getTranscriptStats).mockResolvedValue(STATS)
      renderDetail()

      // SPEC-059: rutas y latencia tras el desplegable del final de la página
      const techInfo = await expandTechInfo(user)
      expect(within(techInfo).getByText(WAV_PATH)).toBeInTheDocument()
      expect(within(techInfo).getByText(TRANSCRIPT_PATH)).toBeInTheDocument()
      expect(await within(techInfo).findByText('Latencia STT')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Mostrar en Finder' }))
      expect(vi.mocked(mockApi.api.recording.showInFinder)).toHaveBeenCalledWith(WAV_PATH)
    })

    // SPEC-015 · AC-12
    it('asks to overwrite in the "Sobrescribir grabación" dialog and returns to preparation on confirm', async () => {
      const user = userEvent.setup()
      setInterview(RECORDED)
      renderDetail()

      // «Nueva grabación» arranca disabled hasta que resuelve el snapshot de
      // permisos (lección SPEC-029): esperar a enabled antes de pulsar
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Nueva grabación' })).toBeEnabled()
      )
      await user.click(screen.getByRole('button', { name: 'Nueva grabación' }))

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
      // SPEC-059: al volver a Preparación el desplegable técnico deja de existir
      expect(screen.queryByTestId('recording-tech-info')).not.toBeInTheDocument()
    })

    // SPEC-015 · AC-13 (recarga: montaje directo con la entrevista grabada)
    it('restores the persisted summary after a reload, reading the latency from the transcript file', async () => {
      const user = userEvent.setup()
      setInterview(RECORDED)
      vi.mocked(mockApi.api.recording.getTranscriptStats).mockResolvedValue(STATS)
      renderDetail()

      // SPEC-059: el resumen persistido vive tras el desplegable del final
      const techInfo = await expandTechInfo(user)
      expect(await within(techInfo).findByText('Latencia STT')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.recording.getTranscriptStats)).toHaveBeenCalledWith(
        TRANSCRIPT_PATH
      )
      expect(
        within(techInfo).getByText('mediana 1,2 s · p95 2,8 s · máx 3,1 s · 14 resultados')
      ).toBeInTheDocument()
      expect(within(techInfo).getByText('OK')).toBeInTheDocument()
      expect(within(techInfo).getByText(WAV_PATH)).toBeInTheDocument()
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

      // Coexistencia: cronómetro de grabación (en la top bar) + guión legible en
      // la misma página. SPEC-025: los objetivos viven en la sección superior
      // única (h3). SPEC-042 (adaptación): el bloque de EDICIÓN de objetivos (h4)
      // dentro del Guión queda derogado — la sección fusionada es la superficie única.
      expect(within(topBarRecordingControls()).getByText('00:00')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Guión' })).toBeInTheDocument()
      expect(screen.getByText(/Pregunta clave para la llamada/)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Objetivos', level: 3 })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Objetivos', level: 4 })).not.toBeInTheDocument()
    })
  })
})
