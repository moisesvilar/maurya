/**
 * SPEC-025: Objetivos destacados y evaluación de cumplimiento post-grabación
 * (mitad UI). Tests de la sección Objetivos montada vía InterviewDetailPage
 * (patrón ScriptSection/AssistantPanel): frontera de mocking = window.api
 * (installMockApi); el seguimiento en vivo se inyecta con emitAssistantUpdate
 * y la evaluación automática con emitObjectiveEvaluation.
 * Lecciones aplicadas: sonner tolerante (findAllByText ≥1); máx 1 tooltip
 * hover por render; estados por data-state (jsdom no aplica Tailwind).
 */
import { act, render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InterviewDetailPage } from '@/pages/InterviewDetailPage'
import type { Company, Interview } from '@/types/domain'
import type { LlmResult } from '@/types/llm'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

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

const TRANSCRIPT_PATH = '/tmp/maurya-recordings/entrevista.transcript.json'

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: 'i-1',
    discoveryId: 'd-1',
    companyId: 'c-1',
    contactId: null,
    templateId: null,
    title: 'Discovery con Acme',
    status: 'draft',
    scriptMarkdown: null,
    objectives: ['Objetivo cero', 'Objetivo uno'],
    wavPath: null,
    transcriptPath: null,
    createdAt: '2026-07-04T10:00:00.000Z',
    updatedAt: '2026-07-04T10:00:00.000Z',
    ...overrides
  }
}

/** Entrevista grabada con transcript y SIN evaluación (candidata a evaluar). */
const RECORDED = interview({
  status: 'recorded',
  wavPath: '/tmp/maurya-recordings/entrevista.wav',
  transcriptPath: TRANSCRIPT_PATH
})

/** Entrevista con la evaluación persistida: cero cumplido, uno no cumplido. */
const EVALUATED = interview({
  status: 'recorded',
  wavPath: '/tmp/maurya-recordings/entrevista.wav',
  transcriptPath: TRANSCRIPT_PATH,
  objectiveResults: [
    { met: true, reason: 'Se obtuvo el dato concreto con cifras del último trimestre.' },
    { met: false, reason: 'La conversación no llegó a tocar este tema con hechos pasados.' }
  ]
})

function setInterview(value: Interview): void {
  vi.mocked(mockApi.api.db.getInterview).mockResolvedValue({ ok: true, data: value })
}

function setHasKey(hasAnthropicKey: boolean): void {
  vi.mocked(mockApi.api.llm.getStatus).mockResolvedValue({
    ok: true,
    data: { hasAnthropicKey }
  })
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

/** Monta el detalle y devuelve la sección Objetivos una vez cargada. */
async function findSection(): Promise<HTMLElement> {
  renderDetail()
  return await screen.findByTestId('objectives-section')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
  setInterview(interview())
  setHasKey(true)
})

describe('ObjectivesSection', () => {
  describe('placement and base states', () => {
    // SPEC-025 · AC-01
    it('renders the Objetivos section between the header and the Grabación section with pending Target items', async () => {
      const section = await findSection()

      expect(
        within(section).getByRole('heading', { name: 'Objetivos', level: 3 })
      ).toBeInTheDocument()
      // Posición: después del título de la cabecera y antes de "Grabación"
      const title = screen.getByRole('heading', { name: 'Discovery con Acme' })
      const recordingHeading = screen.getByRole('heading', { name: 'Grabación' })
      expect(title.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(
        section.compareDocumentPosition(recordingHeading) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      // Un objetivo por línea, todos pendientes (icono Target muted = data-state pending)
      const items = within(section).getAllByTestId('objective-item')
      expect(items.map((item) => item.textContent)).toEqual(['Objetivo cero', 'Objetivo uno'])
      items.forEach((item) => expect(item).toHaveAttribute('data-state', 'pending'))
    })

    // SPEC-025 · AC-02
    it('shows the "Sin objetivos" empty state with the secondary hint when there are no objectives', async () => {
      setInterview(interview({ objectives: [] }))
      const section = await findSection()

      expect(await within(section).findByText('Sin objetivos')).toBeInTheDocument()
      expect(
        within(section).getByText('Se generan con el guión o se añaden editándolo')
      ).toBeInTheDocument()
      expect(within(section).queryAllByTestId('objective-item')).toHaveLength(0)
    })

    // SPEC-025 · AC-04 (la edición vive en la sección Guión; adaptado por
    // SPEC-029: la lista editable está siempre activa — sin botón "Editar" —
    // y "Guardar" solo aparece con cambios)
    it('reflects the updated objectives list after editing and saving in the Guión section', async () => {
      const user = userEvent.setup()
      const withScript = interview({
        scriptMarkdown: '# Guión',
        objectives: ['Objetivo cero', 'Objetivo uno'],
        status: 'prepared'
      })
      setInterview(withScript)
      vi.mocked(mockApi.api.db.updateInterview).mockResolvedValue({
        ok: true,
        data: { ...withScript, objectives: ['Objetivo cero', 'Objetivo uno editado'] }
      })
      renderDetail()

      await user.type(await screen.findByLabelText('Objetivo 2'), ' editado')
      await user.click(await screen.findByRole('button', { name: 'Guardar' }))

      const section = screen.getByTestId('objectives-section')
      await waitFor(() =>
        expect(within(section).getByText('Objetivo uno editado')).toBeInTheDocument()
      )
    })
  })

  describe('live tracking', () => {
    // SPEC-025 · AC-05
    it('marks live-covered objectives with the green check while pending ones keep the Target icon', async () => {
      const section = await findSection()

      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          queue: { pending: [], pinned: [] },
          objectivesMet: [1]
        })
      })

      const items = within(section).getAllByTestId('objective-item')
      await waitFor(() => expect(items[1]).toHaveAttribute('data-state', 'met'))
      expect(items[0]).toHaveAttribute('data-state', 'pending')
    })
  })

  describe('automatic evaluation after recording', () => {
    // SPEC-025 · AC-08
    it('shows the "Evaluando objetivos…" indicator while the automatic evaluation is running', async () => {
      setInterview(RECORDED)
      const section = await findSection()

      act(() => {
        mockApi.emitObjectiveEvaluation({ interviewId: 'i-1', status: 'evaluating' })
      })

      const indicator = await within(section).findByRole('button', {
        name: 'Evaluando objetivos…'
      })
      expect(indicator).toBeDisabled()
      // Mientras evalúa, el botón de evaluación manual no está disponible
      expect(
        within(section).queryByRole('button', { name: 'Evaluar objetivos' })
      ).not.toBeInTheDocument()
    })

    // SPEC-025 · AC-09
    it('shows green checks for met objectives and keeps the Target icon for unmet ones after evaluation', async () => {
      setInterview(RECORDED)
      const section = await findSection()

      act(() => {
        mockApi.emitObjectiveEvaluation({ interviewId: 'i-1', status: 'evaluating' })
      })
      act(() => {
        mockApi.emitObjectiveEvaluation({
          interviewId: 'i-1',
          status: 'done',
          interview: EVALUATED
        })
      })

      const items = within(section).getAllByTestId('objective-item')
      await waitFor(() => expect(items[0]).toHaveAttribute('data-state', 'met'))
      expect(items[1]).toHaveAttribute('data-state', 'unmet')
      expect(
        within(section).queryByRole('button', { name: 'Evaluando objetivos…' })
      ).not.toBeInTheDocument()
    })

    // SPEC-025 · AC-10
    it('shows the short reason below each objective (met and unmet) after evaluation', async () => {
      setInterview(RECORDED)
      const section = await findSection()

      act(() => {
        mockApi.emitObjectiveEvaluation({
          interviewId: 'i-1',
          status: 'done',
          interview: EVALUATED
        })
      })

      const reasons = await within(section).findAllByTestId('objective-reason')
      expect(reasons.map((reason) => reason.textContent)).toEqual([
        'Se obtuvo el dato concreto con cifras del último trimestre.',
        'La conversación no llegó a tocar este tema con hechos pasados.'
      ])
    })

    // SPEC-025 · AC-11
    it('renders the persisted evaluation on load without re-evaluating', async () => {
      setInterview(EVALUATED)
      const section = await findSection()

      const items = within(section).getAllByTestId('objective-item')
      await waitFor(() => expect(items[0]).toHaveAttribute('data-state', 'met'))
      expect(items[1]).toHaveAttribute('data-state', 'unmet')
      expect(within(section).getAllByTestId('objective-reason')).toHaveLength(2)
      // Sin re-evaluación: ni llamada manual ni indicador de curso
      expect(vi.mocked(mockApi.api.llm.evaluateObjectives)).not.toHaveBeenCalled()
      expect(
        within(section).queryByRole('button', { name: 'Evaluando objetivos…' })
      ).not.toBeInTheDocument()
    })

    // SPEC-025 · AC-12
    it('lets the final evaluation prevail over an objective covered live', async () => {
      setInterview(RECORDED)
      const section = await findSection()

      // El seguimiento en vivo marcó el objetivo 1 como cubierto…
      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          queue: { pending: [], pinned: [] },
          objectivesMet: [1]
        })
      })
      const items = within(section).getAllByTestId('objective-item')
      await waitFor(() => expect(items[1]).toHaveAttribute('data-state', 'met'))

      // …pero la evaluación final concluye que NO se cumplió → prevalece
      act(() => {
        mockApi.emitObjectiveEvaluation({
          interviewId: 'i-1',
          status: 'done',
          interview: EVALUATED
        })
      })
      await waitFor(() => expect(items[1]).toHaveAttribute('data-state', 'unmet'))
      expect(
        within(section).getByText('La conversación no llegó a tocar este tema con hechos pasados.')
      ).toBeInTheDocument()
    })

    // SPEC-025 · AC-17 (UI)
    it('shows the error toast and returns to the neutral state when the automatic evaluation fails', async () => {
      setInterview(RECORDED)
      const section = await findSection()

      act(() => {
        mockApi.emitObjectiveEvaluation({ interviewId: 'i-1', status: 'evaluating' })
      })
      act(() => {
        mockApi.emitObjectiveEvaluation({
          interviewId: 'i-1',
          status: 'error',
          error: { kind: 'connection', message: 'sin conexión con la API' }
        })
      })

      const toasts = await screen.findAllByText('No se pudieron evaluar los objetivos')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // Estado neutro: objetivos pendientes, sin indicador, botón disponible de nuevo
      within(section)
        .getAllByTestId('objective-item')
        .forEach((item) => expect(item).toHaveAttribute('data-state', 'pending'))
      expect(
        within(section).queryByRole('button', { name: 'Evaluando objetivos…' })
      ).not.toBeInTheDocument()
      expect(within(section).getByRole('button', { name: 'Evaluar objetivos' })).toBeInTheDocument()
    })
  })

  describe('manual evaluation', () => {
    // SPEC-025 · AC-19
    it('shows the "Evaluar objetivos" button when there are objectives, a transcript and no evaluation', async () => {
      setInterview(RECORDED)
      const section = await findSection()

      expect(
        await within(section).findByRole('button', { name: 'Evaluar objetivos' })
      ).toBeEnabled()
    })

    // SPEC-025 · AC-20
    it('evaluates manually showing the loading state and then the results with the success toast', async () => {
      const user = userEvent.setup()
      setInterview(RECORDED)
      let resolveEvaluation!: (value: LlmResult<Interview>) => void
      vi.mocked(mockApi.api.llm.evaluateObjectives).mockReturnValue(
        new Promise<LlmResult<Interview>>((resolve) => {
          resolveEvaluation = resolve
        })
      )
      const section = await findSection()

      await user.click(await within(section).findByRole('button', { name: 'Evaluar objetivos' }))

      const loading = await within(section).findByRole('button', {
        name: 'Evaluando objetivos…'
      })
      expect(loading).toBeDisabled()
      expect(vi.mocked(mockApi.api.llm.evaluateObjectives)).toHaveBeenCalledWith('i-1')

      resolveEvaluation({ ok: true, data: EVALUATED })

      const toasts = await screen.findAllByText('Objetivos evaluados')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      const items = within(section).getAllByTestId('objective-item')
      expect(items[0]).toHaveAttribute('data-state', 'met')
      expect(items[1]).toHaveAttribute('data-state', 'unmet')
    })

    // SPEC-025 · AC-21
    it('disables the evaluate button with the key tooltip when there is no Anthropic key', async () => {
      const user = userEvent.setup()
      setHasKey(false)
      setInterview(RECORDED)
      const section = await findSection()

      const button = await within(section).findByRole('button', { name: 'Evaluar objetivos' })
      expect(button).toBeDisabled()

      const wrapper = button.closest('span[tabindex="0"]')
      if (wrapper === null) {
        throw new Error('El botón deshabilitado debe estar envuelto por el TooltipTrigger')
      }
      await user.hover(wrapper)
      expect(
        (
          await screen.findAllByText(
            'Configura tu clave de Anthropic en Ajustes para evaluar los objetivos'
          )
        ).length
      ).toBeGreaterThanOrEqual(1)
    })

    // SPEC-025 · AC-22
    it('hides the evaluate button when an evaluation is already persisted', async () => {
      setInterview(EVALUATED)
      const section = await findSection()

      await within(section).findAllByTestId('objective-reason')
      expect(
        within(section).queryByRole('button', { name: 'Evaluar objetivos' })
      ).not.toBeInTheDocument()
    })

    // SPEC-025 · AC-23
    it('hides the evaluate button when the interview has no transcript', async () => {
      setInterview(interview())
      const section = await findSection()

      // La clave está configurada y hay objetivos, pero sin transcript no hay botón
      await within(section).findAllByTestId('objective-item')
      expect(
        within(section).queryByRole('button', { name: 'Evaluar objetivos' })
      ).not.toBeInTheDocument()
    })
  })
})
