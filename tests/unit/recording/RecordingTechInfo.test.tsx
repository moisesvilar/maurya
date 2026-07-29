/**
 * SPEC-059: la información técnica de la grabación (latencia STT + rutas del
 * WAV y del transcript) deja la zona bajo la cabecera y pasa al final de la
 * pantalla, dentro de un Collapsible plegado por defecto.
 *
 * Arnés: las dos páginas de detalle REALES (entrevista y captura) montadas bajo
 * <Layout/>, porque la sesión de grabación vive en la top bar portalada al slot
 * del Layout (patrón RecordingSection.test.tsx / CaptureDetailPage.recordingControls).
 * Fronteras de mocking: servicios del spike (permissionsService/captureService/
 * wavRecorderService) + bridge window.api.
 *
 * Lecciones aplicadas: el arranque de grabación atraviesa el aviso de
 * consentimiento (SPEC-019); los headings «Guión»/«Nota» son asíncronos
 * (lección SPEC-029) → findByRole; el nodo contenedor del CollapsibleContent
 * SOBREVIVE al plegado (hidden, para medir la altura) y solo se desmontan sus
 * hijos, así que «plegado» se asierta con expectTechInfoCollapsed y nunca con
 * queryByTestId('recording-tech-info-content') a secas.
 */
import { act, render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CaptureDetailPage } from '@/pages/CaptureDetailPage'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { InterviewDetailPage } from '@/pages/InterviewDetailPage'
import {
  acquireMicrophoneStream,
  acquireSystemAudioStream,
  listAudioInputDevices
} from '@/services/captureService'
import { getPermissionsStatus } from '@/services/permissionsService'
import type { LatencyStats, StopResult } from '@/types/audio'
import type { Company, Discovery, Interview } from '@/types/domain'
import { createFakeAudioStream, type FakeMediaStreamTrack } from '../../helpers/fakeMediaStream'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'
import { TECH_INFO_TRIGGER, expandTechInfo } from '../../helpers/recordingTechInfo'

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

vi.mock('@/services/wavRecorderService', () => ({
  CAPTURE_SAMPLE_RATE: 16000,
  WavRecorderService: class {
    start = vi.fn()
    stop = vi.fn()
    getLevels = vi.fn(() => ({ microphone: 0, system: 0 }))
    durationSeconds = 0
    samplesWritten = 0
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

const DISCOVERY: Discovery = {
  id: 'd-1',
  name: 'Vertical Sanidad',
  objectives: null,
  createdAt: '2026-07-01T09:00:00.000Z',
  updatedAt: '2026-07-01T09:00:00.000Z'
}

const WAV_PATH = '/tmp/maurya-recordings/entrevista-i-1.wav'
const TRANSCRIPT_PATH = '/tmp/maurya-recordings/entrevista-i-1.transcript.json'
const STATS: LatencyStats = { count: 14, p50Ms: 1200, p95Ms: 2800, maxMs: 3100 }

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: 'i-1',
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

const RECORDED = interview({
  wavPath: WAV_PATH,
  transcriptPath: TRANSCRIPT_PATH,
  status: 'recorded'
})

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

/** Detalle de entrevista (ruta anidada real) bajo el Layout. */
function renderInterviewDetail(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/discoveries/d-1/companies/c-1/interviews/i-1']}>
        <Routes>
          <Route path="/" element={<Layout />}>
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

/** Detalle de captura (sección Capturas) bajo el Layout. */
function renderCaptureDetail(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/captures/i-1']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="captures/:id" element={<CaptureDetailPage />} />
            <Route path="captures" element={<div>CAPTURES_LIST_PROBE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/**
 * «Plegado» en Radix Collapsible: el nodo contenedor del contenido SOBREVIVE
 * con `hidden` y data-state="closed" (lo necesita para medir la altura de la
 * animación), pero sus HIJOS se desmontan. Por eso el estado plegado se asierta
 * por el contenedor + la ausencia de las métricas en el documento, nunca por la
 * ausencia del nodo `recording-tech-info-content`.
 */
function expectTechInfoCollapsed(): void {
  const content = screen.getByTestId('recording-tech-info-content')
  expect(content).toHaveAttribute('data-state', 'closed')
  expect(content).not.toBeVisible()
  expect(screen.queryByText('Latencia STT')).not.toBeInTheDocument()
  expect(screen.queryByText(WAV_PATH)).not.toBeInTheDocument()
  expect(screen.queryByText(TRANSCRIPT_PATH)).not.toBeInTheDocument()
}

/** Arranque de grabación atravesando el aviso de consentimiento (SPEC-019). */
async function startRecording(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Iniciar grabación' }))
  const consent = await screen.findByRole('alertdialog')
  await user.click(within(consent).getByRole('button', { name: 'Entendido, iniciar grabación' }))
  await screen.findByRole('button', { name: 'Detener' })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
  vi.mocked(mockApi.api.db.getDiscovery).mockResolvedValue({ ok: true, data: DISCOVERY })
  setInterview(RECORDED)
  vi.mocked(mockApi.api.recording.getTranscriptStats).mockResolvedValue(STATS)
  vi.mocked(getPermissionsStatus).mockResolvedValue({
    microphone: 'granted',
    systemAudio: 'granted'
  })
  vi.mocked(listAudioInputDevices).mockResolvedValue([])
})

describe('RecordingTechInfo (SPEC-059 — información técnica tras un desplegable al final)', () => {
  describe('desplegable al final de la pantalla', () => {
    // SPEC-059 · AC-01
    it('renders the trigger at the end of the page, after the Nota and Guión sections', async () => {
      renderInterviewDetail()

      // Asíncronos (lección SPEC-029): las secciones solo aparecen cuando
      // NoteScriptSections resuelve getNoteByInterview
      const guion = await screen.findByRole('heading', { name: 'Guión' })
      const nota = await screen.findByRole('heading', { name: 'Nota' })
      const techInfo = await screen.findByTestId('recording-tech-info')
      expect(within(techInfo).getByText(TECH_INFO_TRIGGER)).toBeInTheDocument()

      /** a precede a b en el orden del documento. */
      const expectBefore = (a: HTMLElement, b: HTMLElement): void => {
        expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      }
      expectBefore(guion, techInfo)
      expectBefore(nota, techInfo)
    })

    // SPEC-059 · AC-02
    it('starts collapsed: neither the STT latency nor the WAV/transcript paths are visible', async () => {
      renderInterviewDetail()

      expect(await screen.findByTestId('recording-tech-info-trigger')).toBeInTheDocument()
      expectTechInfoCollapsed()
    })

    // SPEC-059 · AC-03
    it('expands on click showing the "Latencia STT" row and both file paths', async () => {
      const user = userEvent.setup()
      renderInterviewDetail()

      const content = await expandTechInfo(user)
      expect(await within(content).findByText('Latencia STT')).toBeInTheDocument()
      expect(
        within(content).getByText('mediana 1,2 s · p95 2,8 s · máx 3,1 s · 14 resultados')
      ).toBeInTheDocument()
      expect(within(content).getByText('OK')).toBeInTheDocument()
      expect(within(content).getByText(WAV_PATH)).toBeInTheDocument()
      expect(within(content).getByText(TRANSCRIPT_PATH)).toBeInTheDocument()
    })

    // SPEC-059 · AC-04
    it('collapses again on a second click and the metrics stop being visible', async () => {
      const user = userEvent.setup()
      renderInterviewDetail()

      await expandTechInfo(user)
      await user.click(screen.getByTestId('recording-tech-info-trigger'))

      // El trigger sobrevive con su literal constante; las métricas se van
      expect(screen.getByText(TECH_INFO_TRIGGER)).toBeInTheDocument()
      expectTechInfoCollapsed()
    })

    // SPEC-059 · AC-05
    it('no longer renders the latency and the paths in the surface below the header', async () => {
      const user = userEvent.setup()
      renderInterviewDetail()

      const content = await expandTechInfo(user)
      const header = await screen.findByRole('heading', { level: 1, name: 'Discovery con Acme' })

      // Las únicas apariciones de latencia y rutas están DENTRO del desplegable,
      // y el desplegable va después de la cabecera (no bajo ella)
      expect(screen.getAllByText(WAV_PATH)).toHaveLength(1)
      expect(within(content).getByText(WAV_PATH)).toBeInTheDocument()
      expect(screen.getAllByText('Latencia STT')).toHaveLength(1)
      expect(within(content).getByText('Latencia STT')).toBeInTheDocument()
      expect(
        header.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })
  })

  describe('ambas páginas', () => {
    // SPEC-059 · AC-06
    it('renders the same collapsed trigger at the end of the capture detail page', async () => {
      renderCaptureDetail()

      const guion = await screen.findByRole('heading', { name: 'Guión' })
      const techInfo = await screen.findByTestId('recording-tech-info')
      expect(within(techInfo).getByText(TECH_INFO_TRIGGER)).toBeInTheDocument()
      expect(
        guion.compareDocumentPosition(techInfo) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      expectTechInfoCollapsed()
    })

    // SPEC-059 · AC-07
    it('shows the latency and the paths of that capture when expanded', async () => {
      const user = userEvent.setup()
      renderCaptureDetail()

      const content = await expandTechInfo(user)
      expect(await within(content).findByText('Latencia STT')).toBeInTheDocument()
      expect(within(content).getByText(WAV_PATH)).toBeInTheDocument()
      expect(within(content).getByText(TRANSCRIPT_PATH)).toBeInTheDocument()
    })
  })

  describe('sin grabación — el desplegable no existe', () => {
    // SPEC-059 · AC-08
    it('does not render at all on an interview without a recording (Preparación)', async () => {
      setInterview(interview())
      renderInterviewDetail()

      expect(await screen.findByRole('button', { name: 'Iniciar grabación' })).toBeInTheDocument()
      expect(screen.queryByTestId('recording-tech-info')).not.toBeInTheDocument()
      expect(screen.queryByText(TECH_INFO_TRIGGER)).not.toBeInTheDocument()
    })

    // SPEC-059 · AC-09
    it('does not render while the recording is running (Grabando)', async () => {
      const user = userEvent.setup()
      setInterview(interview())
      setupGrantedCapture()
      renderInterviewDetail()

      await startRecording(user)

      expect(screen.queryByTestId('recording-tech-info')).not.toBeInTheDocument()
    })

    // SPEC-059 · AC-10
    it('disappears when "Nueva grabación" is confirmed in the top bar', async () => {
      const user = userEvent.setup()
      setupGrantedCapture()
      renderInterviewDetail()

      expect(await screen.findByTestId('recording-tech-info')).toBeInTheDocument()
      // «Nueva grabación» arranca disabled hasta resolver el snapshot de
      // permisos (lección SPEC-029): re-consultar el botón antes del click
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'Nueva grabación' })).toBeEnabled()
      )
      await user.click(screen.getByRole('button', { name: 'Nueva grabación' }))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Sobrescribir' }))

      expect(await screen.findByRole('button', { name: 'Iniciar grabación' })).toBeInTheDocument()
      expect(screen.queryByTestId('recording-tech-info')).not.toBeInTheDocument()
    })
  })

  describe('contenido parcial', () => {
    // SPEC-059 · AC-11
    it('shows only the paths, with no "Latencia STT" row, when there are no latency stats', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.recording.getTranscriptStats).mockResolvedValue(null)
      renderInterviewDetail()

      const content = await expandTechInfo(user)
      expect(within(content).getByText(WAV_PATH)).toBeInTheDocument()
      expect(within(content).getByText(TRANSCRIPT_PATH)).toBeInTheDocument()
      expect(within(content).queryByText('Latencia STT')).not.toBeInTheDocument()
      // Sin hueco vacío: el contenido son exactamente las dos rutas
      expect(content.querySelectorAll('p.font-mono')).toHaveLength(2)
    })

    // SPEC-059 · AC-12
    it('renders no transcript line when transcriptPath is null (degraded or failed transcription)', async () => {
      const user = userEvent.setup()
      setInterview(interview({ wavPath: WAV_PATH, transcriptPath: null, status: 'recorded' }))
      renderInterviewDetail()

      const content = await expandTechInfo(user)
      expect(within(content).getByText(WAV_PATH)).toBeInTheDocument()
      expect(within(content).queryByText(TRANSCRIPT_PATH)).not.toBeInTheDocument()
      expect(content.querySelectorAll('p.font-mono')).toHaveLength(1)
      // Sin transcript no hay latencia persistida que leer
      expect(vi.mocked(mockApi.api.recording.getTranscriptStats)).not.toHaveBeenCalled()
    })
  })

  describe('no regresión de la superficie de grabación', () => {
    // SPEC-059 · AC-13
    it('keeps the degraded-transcription notice below the header, outside the collapsible', async () => {
      const user = userEvent.setup()
      setInterview(interview())
      setupGrantedCapture()
      renderInterviewDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitTranscriptionStatus({ status: 'active', degraded: true })
      })

      expect(await screen.findByTestId('transcription-degraded-alert')).toBeInTheDocument()
      expect(screen.queryByTestId('recording-tech-info')).not.toBeInTheDocument()
    })

    // SPEC-059 · AC-14
    it('keeps the "Falta la key" notice below the header', async () => {
      const user = userEvent.setup()
      setInterview(interview())
      setupGrantedCapture()
      renderInterviewDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitTranscriptionStatus({ status: 'no-key' })
      })

      expect(await screen.findByText('Falta la key de Deepgram')).toBeInTheDocument()
      expect(screen.queryByTestId('recording-tech-info')).not.toBeInTheDocument()
    })

    // SPEC-059 · AC-15 (el único estado donde alerta y desplegable coexisten:
    // la parada por desconexión deja el error en pantalla y la entrevista grabada)
    it('keeps the capture error alert below the header and outside the collapsible', async () => {
      const user = userEvent.setup()
      setInterview(interview())
      const { micTrack } = setupGrantedCapture()
      vi.mocked(mockApi.api.recording.stop).mockResolvedValue(STOP_RESULT)
      renderInterviewDetail()
      await startRecording(user)

      act(() => {
        micTrack.disconnect()
      })

      const alertText = await screen.findByText('Dispositivo desconectado')
      const alert = alertText.closest('[role="alert"]')
      expect(alert).not.toBeNull()

      // La alerta está fuera del desplegable y ANTES que él en el documento
      const techInfo = await screen.findByTestId('recording-tech-info')
      expect(techInfo.contains(alert)).toBe(false)
      expect(
        (alert as HTMLElement).compareDocumentPosition(techInfo) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })
  })

  describe('estado efímero del desplegable', () => {
    // SPEC-059 · AC-17 (el equivalente unitario de «navegar y volver» es
    // desmontar y volver a montar la página: el estado del Collapsible es
    // local al componente, no hay persistencia que consultar)
    it('comes back collapsed after leaving the page and returning', async () => {
      const user = userEvent.setup()
      const view = renderInterviewDetail()

      await expandTechInfo(user)
      expect(screen.getByTestId('recording-tech-info-content')).toBeInTheDocument()

      view.unmount()
      renderInterviewDetail()

      expect(await screen.findByTestId('recording-tech-info-trigger')).toBeInTheDocument()
      expectTechInfoCollapsed()
    })
  })
})
