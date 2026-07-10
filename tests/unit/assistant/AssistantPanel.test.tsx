/**
 * Tests del panel del asistente y del panel de objetivos (SPEC-016, mitad UI),
 * montados vía InterviewDetailPage con la grabación en curso (mocks del spike,
 * patrón SPEC-015) y eventos inyectados con emitAssistantUpdate.
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
import { InterviewDetailPage } from '@/pages/InterviewDetailPage'
import {
  acquireMicrophoneStream,
  acquireSystemAudioStream,
  listAudioInputDevices
} from '@/services/captureService'
import { getPermissionsStatus } from '@/services/permissionsService'
import type { AssistantSuggestion } from '@/types/assistant'
import type { Company, Interview } from '@/types/domain'
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

let mockApi: MockApiHandle

const COMPANY: Company = {
  id: 'c-1',
  discoveryId: 'd-1',
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
    contactId: null,
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

const INITIAL_TEXT = 'El asistente te sugerirá la siguiente pregunta en cuanto haya conversación.'

function suggestion(overrides: Partial<AssistantSuggestion> = {}): AssistantSuggestion {
  return {
    action: 'continue',
    suggestedQuestion: '¿Cuándo fue la última vez que pasó?',
    reason: 'Ya hay material concreto para avanzar',
    alarms: [],
    ...overrides
  }
}

const STOP_RESULT: StopResult = {
  filePath: '/tmp/maurya-recordings/entrevista.wav',
  durationSeconds: 95,
  sizeBytes: 44,
  sampleRate: 16000,
  channels: 2,
  transcriptPath: '/tmp/maurya-recordings/entrevista.transcript.json',
  latency: null,
  interview: interview({
    wavPath: '/tmp/maurya-recordings/entrevista.wav',
    transcriptPath: '/tmp/maurya-recordings/entrevista.transcript.json',
    status: 'recorded'
  })
}

function setInterview(value: Interview): void {
  vi.mocked(mockApi.api.db.getInterview).mockResolvedValue({ ok: true, data: value })
}

function renderDetail(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/discoveries/d-1/companies/c-1/interviews/i-1']}>
        <Routes>
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
 * Arranca la grabación atravesando el aviso de consentimiento (SPEC-019):
 * "Iniciar grabación" abre el AlertDialog "Aviso de grabación" y la captura
 * solo arranca tras "Entendido, iniciar grabación". La casilla queda sin
 * marcar: no se persiste ninguna preferencia entre tests.
 */
async function startRecording(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Iniciar grabación' }))
  const consent = await screen.findByRole('alertdialog')
  expect(
    within(consent).getByRole('heading', { name: 'Aviso de grabación' })
  ).toBeInTheDocument()
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
  vi.mocked(mockApi.api.llm.getStatus).mockResolvedValue({
    ok: true,
    data: { hasAnthropicKey: true }
  })
  vi.mocked(listAudioInputDevices).mockResolvedValue([])
  vi.mocked(getPermissionsStatus).mockResolvedValue({
    microphone: 'granted',
    systemAudio: 'granted'
  })
  vi.mocked(acquireMicrophoneStream).mockResolvedValue(createFakeAudioStream().stream)
  vi.mocked(acquireSystemAudioStream).mockResolvedValue(createFakeAudioStream().stream)
  recorderMock.start.mockResolvedValue(undefined)
  recorderMock.stop.mockResolvedValue(undefined)
  recorderMock.getLevels.mockReturnValue({ microphone: 0, system: 0 })
  vi.mocked(mockApi.api.recording.stop).mockResolvedValue(STOP_RESULT)
})

describe('AssistantPanel', () => {
  describe('activation states', () => {
    // SPEC-016 · AC-01 (parte UI: estado inicial del panel durante la grabación)
    it('shows the initial waiting text while recording before any suggestion', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      expect(screen.getByText(INITIAL_TEXT)).toBeInTheDocument()
    })

    // SPEC-016 · AC-02
    it('shows the discreet "Analizando…" indicator without hiding the previous suggestion', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion(),
          objectivesMet: []
        })
      })
      act(() => {
        mockApi.emitAssistantUpdate({ state: 'analyzing', objectivesMet: [] })
      })

      expect(await screen.findByText('Analizando…')).toBeInTheDocument()
      // La sugerencia anterior sigue visible
      expect(screen.getByText('¿Cuándo fue la última vez que pasó?')).toBeInTheDocument()
    })

    // SPEC-016 · AC-03 (UI)
    it('shows the inactive no-key state with a link to Ajustes', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitAssistantUpdate({ state: 'no-key', objectivesMet: [] })
      })

      expect(
        await screen.findByText(/Asistente inactivo — configura tu clave de Anthropic en/)
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/settings')
    })

    // SPEC-016 · AC-04
    it('stays in the initial state while the transcription is inactive (no assistant activity)', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      // Transcripción inactiva: no llega ningún evento del asistente
      act(() => {
        mockApi.emitTranscriptionStatus({ status: 'inactive' })
      })

      expect(screen.getByText('Inactiva')).toBeInTheDocument()
      expect(screen.getByText(INITIAL_TEXT)).toBeInTheDocument()
      expect(screen.queryByText('Analizando…')).not.toBeInTheDocument()
    })
  })

  describe('the suggestion', () => {
    // SPEC-016 · AC-05
    it('shows exactly the action badge, the suggested question and the one-line reason — nothing else', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion(),
          objectivesMet: []
        })
      })

      expect(await screen.findByText('Continúa')).toBeInTheDocument()
      expect(screen.getByText('¿Cuándo fue la última vez que pasó?')).toBeInTheDocument()
      expect(screen.getByText('Ya hay material concreto para avanzar')).toBeInTheDocument()
      // Nada más: sin chips de alarma, sin indicador ni línea de error
      expect(screen.queryByText('Profundiza')).not.toBeInTheDocument()
      expect(screen.queryByText('Cumplido')).not.toBeInTheDocument()
      expect(screen.queryByText('Analizando…')).not.toBeInTheDocument()
      expect(screen.queryByText(/No se pudo analizar/)).not.toBeInTheDocument()
      expect(screen.queryByText(INITIAL_TEXT)).not.toBeInTheDocument()
    })

    // SPEC-016 · AC-06
    it('replaces the previous suggestion when a new one arrives (only one visible)', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion({ suggestedQuestion: '¿Primera pregunta?' }),
          objectivesMet: []
        })
      })
      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion({ suggestedQuestion: '¿Segunda pregunta?' }),
          objectivesMet: []
        })
      })

      expect(await screen.findByText('¿Segunda pregunta?')).toBeInTheDocument()
      expect(screen.queryByText('¿Primera pregunta?')).not.toBeInTheDocument()
    })

    // SPEC-016 · AC-07
    it('shows the amber "Profundiza" badge with the concrete reason for dig_deeper', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion({
            action: 'dig_deeper',
            suggestedQuestion: '¿Cuánto tiempo os llevó la última vez?',
            reason: 'Falta evidencia concreta según The Mom Test: pide un caso real'
          }),
          objectivesMet: []
        })
      })

      expect(await screen.findByText('Profundiza')).toBeInTheDocument()
      expect(
        screen.getByText('Falta evidencia concreta según The Mom Test: pide un caso real')
      ).toBeInTheDocument()
    })

    // SPEC-016 · AC-08
    it('shows the alarm chips with their Spanish labels when alarms are detected', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion({
            action: 'dig_deeper',
            alarms: ['compliment', 'generic', 'hypothetical']
          }),
          objectivesMet: []
        })
      })

      expect(await screen.findByText('Cumplido')).toBeInTheDocument()
      expect(screen.getByText('Genérico')).toBeInTheDocument()
      expect(screen.getByText('Hipotético')).toBeInTheDocument()
    })
  })

  describe('live objectives', () => {
    // SPEC-016 · AC-09 (UI)
    it('shows the objectives panel with pending/covered states from objectivesMet', async () => {
      const user = userEvent.setup()
      setInterview(interview({ objectives: ['Objetivo cero', 'Objetivo uno'] }))
      renderDetail()
      await startRecording(user)

      expect(screen.getByRole('heading', { name: 'Objetivos', level: 4 })).toBeInTheDocument()

      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion(),
          objectivesMet: [1]
        })
      })

      await waitFor(() => expect(screen.getByText('Objetivo uno')).toHaveClass('line-through'))
      expect(screen.getByText('Objetivo cero')).not.toHaveClass('line-through')
    })

    // SPEC-016 · AC-10
    it('does not show the objectives panel when the interview has no objectives', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      expect(screen.queryByRole('heading', { name: 'Objetivos', level: 4 })).not.toBeInTheDocument()
    })
  })

  describe('feedback', () => {
    // SPEC-016 · AC-11 (UI)
    it('sends the vote and highlights the chosen thumb, switchable until the next suggestion', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)
      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion(),
          objectivesMet: []
        })
      })

      const upButton = await screen.findByRole('button', { name: 'Sugerencia útil' })
      const downButton = screen.getByRole('button', { name: 'Sugerencia no útil' })

      await user.click(upButton)
      expect(vi.mocked(mockApi.api.assistant.sendFeedback)).toHaveBeenCalledWith('up')
      expect(upButton).toHaveClass('bg-accent')

      await user.click(downButton)
      expect(vi.mocked(mockApi.api.assistant.sendFeedback)).toHaveBeenCalledWith('down')
      expect(downButton).toHaveClass('bg-accent')
      expect(upButton).not.toHaveClass('bg-accent')
    })
  })

  describe('errors', () => {
    // SPEC-016 · AC-14 (UI)
    it('shows the discreet retry line under the preserved suggestion on analysis error', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)

      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion(),
          objectivesMet: []
        })
      })
      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'error',
          suggestion: suggestion(),
          objectivesMet: [],
          error: { kind: 'connection', message: 'sin conexión con la API' }
        })
      })

      expect(
        await screen.findByText('No se pudo analizar (se reintentará): sin conexión con la API')
      ).toBeInTheDocument()
      // La última sugerencia válida se conserva visible
      expect(screen.getByText('¿Cuándo fue la última vez que pasó?')).toBeInTheDocument()
    })
  })

  describe('end of recording', () => {
    // SPEC-016 · AC-15 (UI)
    it('removes the assistant panel when the recording stops into the recorded state', async () => {
      const user = userEvent.setup()
      renderDetail()
      await startRecording(user)
      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          suggestion: suggestion(),
          objectivesMet: []
        })
      })
      expect(await screen.findByText('¿Cuándo fue la última vez que pasó?')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Detener' }))

      // Estado 3 (Grabada): el panel del asistente desaparece
      expect(await screen.findByRole('button', { name: 'Nueva grabación' })).toBeInTheDocument()
      expect(screen.queryByText('¿Cuándo fue la última vez que pasó?')).not.toBeInTheDocument()
      expect(screen.queryByText(INITIAL_TEXT)).not.toBeInTheDocument()
    })
  })
})
