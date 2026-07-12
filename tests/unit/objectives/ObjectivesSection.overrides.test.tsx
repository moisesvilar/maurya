/**
 * SPEC-028: marcar y desmarcar objetivos como cumplidos con comentario (mitad
 * UI). Sección Objetivos montada vía InterviewDetailPage (arnés de SPEC-025:
 * frontera de mocking = window.api con installMockApi; el seguimiento en vivo
 * se inyecta con emitAssistantUpdate). El diálogo de cumplimiento se abre con
 * el lápiz por objetivo; la precedencia visual es marca manual > evaluación
 * final > seguimiento en vivo.
 * Lecciones aplicadas: sonner tolerante (findAllByText ≥1); estados por
 * data-state y tachado por data-overridden + clase (jsdom no aplica Tailwind);
 * sin aserciones de foco síncronas; queries por testid dentro de la sección
 * (inmunes al aria-hidden del fondo con el Dialog modal abierto).
 */
import { act, render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InterviewDetailPage } from '@/pages/InterviewDetailPage'
import type { Company, Interview, ObjectiveOverride } from '@/types/domain'
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

/** Entrevista con la evaluación LLM persistida: cero cumplido, uno no cumplido. */
const EVALUATED = interview({
  status: 'recorded',
  wavPath: '/tmp/maurya-recordings/entrevista.wav',
  transcriptPath: TRANSCRIPT_PATH,
  objectiveResults: [
    { met: true, reason: 'Se obtuvo el dato concreto con cifras del último trimestre.' },
    { met: false, reason: 'La conversación no llegó a tocar este tema con hechos pasados.' }
  ]
})

const OVERRIDE_MET: ObjectiveOverride = {
  met: true,
  comment: 'El cliente confirmó la compra con una orden firmada.',
  text: 'El gasto de 200 € culminó en una orden firmada, según el entrevistador.'
}

const OVERRIDE_UNMET: ObjectiveOverride = {
  met: false,
  comment: 'Solo hubo cumplidos de cortesía, sin hechos.',
  text: 'No hay evidencia concreta: la conversación quedó en generalidades.'
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

/** Monta el detalle y devuelve la sección Objetivos una vez cargada. */
async function findSection(): Promise<HTMLElement> {
  renderDetail()
  return await screen.findByTestId('objectives-section')
}

/** Abre el diálogo de cumplimiento del objetivo `index` con el lápiz. */
async function openDialog(
  user: UserEvent,
  section: HTMLElement,
  index: number
): Promise<HTMLElement> {
  const pencils = within(section).getAllByTestId('objective-override-button')
  await user.click(pencils[index])
  return await screen.findByTestId('objective-override-dialog')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
  setInterview(interview())
  vi.mocked(mockApi.api.llm.getStatus).mockResolvedValue({
    ok: true,
    data: { hasAnthropicKey: true }
  })
})

describe('ObjectivesSection', () => {
  describe('override dialog opening', () => {
    // SPEC-028 · AC-01
    it('renders a pencil button per objective with its aria-label that opens the compliance dialog', async () => {
      const user = userEvent.setup()
      const section = await findSection()

      const pencils = within(section).getAllByRole('button', {
        name: 'Editar cumplimiento del objetivo'
      })
      expect(pencils).toHaveLength(2)

      await user.click(pencils[0])

      const dialog = await screen.findByTestId('objective-override-dialog')
      expect(
        within(dialog).getByRole('heading', { name: 'Cumplimiento del objetivo' })
      ).toBeInTheDocument()
      // La descripción es el texto del objetivo
      expect(within(dialog).getByText('Objetivo cero')).toBeInTheDocument()
    })

    // SPEC-028 · AC-02
    it('preselects the opposite state with an empty comment when the objective has no manual mark', async () => {
      const user = userEvent.setup()
      setInterview(EVALUATED)
      const section = await findSection()
      await waitFor(() =>
        expect(within(section).getAllByTestId('objective-item')[0]).toHaveAttribute(
          'data-state',
          'met'
        )
      )

      // Objetivo 1 se muestra NO cumplido → preselección "Cumplido", comentario vacío
      const dialogForUnmet = await openDialog(user, section, 1)
      expect(within(dialogForUnmet).getByRole('radio', { name: 'Cumplido' })).toBeChecked()
      expect(within(dialogForUnmet).getByRole('radio', { name: 'No cumplido' })).not.toBeChecked()
      expect(within(dialogForUnmet).getByTestId('objective-override-comment')).toHaveValue('')
      await user.click(within(dialogForUnmet).getByRole('button', { name: 'Cancelar' }))
      await waitFor(() =>
        expect(screen.queryByTestId('objective-override-dialog')).not.toBeInTheDocument()
      )

      // Objetivo 0 se muestra cumplido → preselección "No cumplido"
      const dialogForMet = await openDialog(user, section, 0)
      expect(within(dialogForMet).getByRole('radio', { name: 'No cumplido' })).toBeChecked()
      expect(within(dialogForMet).getByRole('radio', { name: 'Cumplido' })).not.toBeChecked()
    })

    // SPEC-028 · AC-03
    it('restores the saved manual state and comment when reopening the dialog of an overridden objective', async () => {
      const user = userEvent.setup()
      setInterview(interview({ objectiveOverrides: [OVERRIDE_UNMET, null] }))
      const section = await findSection()

      const dialog = await openDialog(user, section, 0)

      expect(within(dialog).getByRole('radio', { name: 'No cumplido' })).toBeChecked()
      expect(within(dialog).getByTestId('objective-override-comment')).toHaveValue(
        OVERRIDE_UNMET.comment
      )
    })
  })

  describe('marking with a comment (happy path)', () => {
    // SPEC-028 · AC-04
    it('saves the met mark showing the loading state, closes the dialog, turns the icon green and toasts "Objetivo actualizado"', async () => {
      const user = userEvent.setup()
      let resolveOverride!: (value: LlmResult<Interview>) => void
      vi.mocked(mockApi.api.llm.overrideObjective).mockReturnValue(
        new Promise<LlmResult<Interview>>((resolve) => {
          resolveOverride = resolve
        })
      )
      const section = await findSection()

      const dialog = await openDialog(user, section, 0)
      // Pendiente → "Cumplido" ya preseleccionado (AC-02); solo falta el comentario
      await user.type(
        within(dialog).getByTestId('objective-override-comment'),
        OVERRIDE_MET.comment
      )
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

      // Estado de carga: Guardar disabled con el diálogo aún abierto
      expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled()
      expect(vi.mocked(mockApi.api.llm.overrideObjective)).toHaveBeenCalledWith(
        'i-1',
        0,
        true,
        OVERRIDE_MET.comment
      )

      resolveOverride({
        ok: true,
        data: interview({ objectiveOverrides: [OVERRIDE_MET, null] })
      })

      await waitFor(() =>
        expect(screen.queryByTestId('objective-override-dialog')).not.toBeInTheDocument()
      )
      const items = within(section).getAllByTestId('objective-item')
      expect(items[0]).toHaveAttribute('data-state', 'met')
      const toasts = await screen.findAllByText('Objetivo actualizado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })

    // SPEC-028 · AC-05
    it('strikes through the previous evaluation reason and shows the rewritten explanation below when a manual mark exists', async () => {
      setInterview({ ...EVALUATED, objectiveOverrides: [null, OVERRIDE_MET] })
      const section = await findSection()

      const reasons = await within(section).findAllByTestId('objective-reason')
      // Objetivo 1 (con marca): explicación previa tachada + marcador no visual
      expect(reasons[1]).toHaveAttribute('data-overridden', 'true')
      expect(reasons[1]).toHaveClass('line-through')
      // Objetivo 0 (sin marca): su explicación NO va tachada
      expect(reasons[0]).not.toHaveAttribute('data-overridden')
      expect(reasons[0]).not.toHaveClass('line-through')
      // Debajo, la explicación reescrita sin tachar
      const rewritten = within(section).getByTestId('objective-override-text')
      expect(rewritten).toHaveTextContent(OVERRIDE_MET.text)
      expect(rewritten).not.toHaveClass('line-through')
    })

    // SPEC-028 · AC-06
    it('saves the unmet mark leaving the muted Target icon with the struck reason and the rewritten text below', async () => {
      const user = userEvent.setup()
      setInterview(EVALUATED)
      vi.mocked(mockApi.api.llm.overrideObjective).mockResolvedValue({
        ok: true,
        data: { ...EVALUATED, objectiveOverrides: [OVERRIDE_UNMET, null] }
      })
      const section = await findSection()
      await waitFor(() =>
        expect(within(section).getAllByTestId('objective-item')[0]).toHaveAttribute(
          'data-state',
          'met'
        )
      )

      const dialog = await openDialog(user, section, 0)
      // Se muestra cumplido → "No cumplido" ya preseleccionado (AC-02)
      await user.type(
        within(dialog).getByTestId('objective-override-comment'),
        OVERRIDE_UNMET.comment
      )
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.llm.overrideObjective)).toHaveBeenCalledWith(
        'i-1',
        0,
        false,
        OVERRIDE_UNMET.comment
      )
      const items = within(section).getAllByTestId('objective-item')
      await waitFor(() => expect(items[0]).toHaveAttribute('data-state', 'unmet'))
      const reasons = within(section).getAllByTestId('objective-reason')
      expect(reasons[0]).toHaveAttribute('data-overridden', 'true')
      expect(within(section).getByTestId('objective-override-text')).toHaveTextContent(
        OVERRIDE_UNMET.text
      )
    })

    // SPEC-028 · AC-07
    it('renders the persisted manual mark, struck reason and rewritten text on load without new LLM calls', async () => {
      setInterview({ ...EVALUATED, objectiveOverrides: [null, OVERRIDE_MET] })
      const section = await findSection()

      const items = within(section).getAllByTestId('objective-item')
      await waitFor(() => expect(items[1]).toHaveAttribute('data-state', 'met'))
      expect(within(section).getAllByTestId('objective-reason')[1]).toHaveAttribute(
        'data-overridden',
        'true'
      )
      expect(within(section).getByTestId('objective-override-text')).toHaveTextContent(
        OVERRIDE_MET.text
      )
      // Todo viene de lo persistido: cero llamadas nuevas al LLM
      expect(vi.mocked(mockApi.api.llm.overrideObjective)).not.toHaveBeenCalled()
      expect(vi.mocked(mockApi.api.llm.evaluateObjectives)).not.toHaveBeenCalled()
    })
  })

  describe('manual mark precedence', () => {
    // SPEC-028 · AC-08
    it('lets the manual met mark prevail over an unmet evaluation showing the green check', async () => {
      setInterview(
        interview({
          status: 'recorded',
          transcriptPath: TRANSCRIPT_PATH,
          objectiveResults: [
            { met: false, reason: 'La conversación no llegó a tocar este tema.' },
            { met: false, reason: 'Tampoco se llegó a tocar este tema.' }
          ],
          objectiveOverrides: [OVERRIDE_MET, null]
        })
      )
      const section = await findSection()

      const items = within(section).getAllByTestId('objective-item')
      await waitFor(() => expect(items[0]).toHaveAttribute('data-state', 'met'))
      // El objetivo sin marca conserva el veredicto de la evaluación
      expect(items[1]).toHaveAttribute('data-state', 'unmet')
    })

    // SPEC-028 · AC-09
    it('lets the manual unmet mark prevail over live coverage keeping the muted Target icon', async () => {
      setInterview(interview({ objectiveOverrides: [OVERRIDE_UNMET, null] }))
      const section = await findSection()
      const items = within(section).getAllByTestId('objective-item')
      await waitFor(() => expect(items[0]).toHaveAttribute('data-state', 'unmet'))

      // El asistente en vivo marca AMBOS como cubiertos durante la grabación…
      act(() => {
        mockApi.emitAssistantUpdate({
          state: 'active',
          queue: { pending: [], pinned: [] },
          objectivesMet: [0, 1]
        })
      })

      // …el objetivo sin marca refleja el vivo; el marcado a mano NO cambia
      await waitFor(() => expect(items[1]).toHaveAttribute('data-state', 'met'))
      expect(items[0]).toHaveAttribute('data-state', 'unmet')
    })
  })

  describe('marking without a previous evaluation', () => {
    // SPEC-028 · AC-10
    it('shows only the rewritten explanation without any struck text when there was no previous evaluation', async () => {
      setInterview(interview({ objectiveOverrides: [OVERRIDE_MET, null] }))
      const section = await findSection()

      const items = within(section).getAllByTestId('objective-item')
      await waitFor(() => expect(items[0]).toHaveAttribute('data-state', 'met'))
      expect(within(section).getByTestId('objective-override-text')).toHaveTextContent(
        OVERRIDE_MET.text
      )
      // No había explicación previa → nada tachado
      expect(within(section).queryAllByTestId('objective-reason')).toHaveLength(0)
    })
  })

  describe('validation', () => {
    // SPEC-028 · AC-11
    it('shows the inline error "El comentario es obligatorio" and performs no call when saving with an empty comment', async () => {
      const user = userEvent.setup()
      const section = await findSection()

      const dialog = await openDialog(user, section, 0)
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

      expect(await within(dialog).findByText('El comentario es obligatorio')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.llm.overrideObjective)).not.toHaveBeenCalled()
      expect(screen.getByTestId('objective-override-dialog')).toBeInTheDocument()
    })

    // SPEC-028 · AC-12
    it('clears the inline error and continues normally when a comment is typed and saved again', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.llm.overrideObjective).mockResolvedValue({
        ok: true,
        data: interview({ objectiveOverrides: [OVERRIDE_MET, null] })
      })
      const section = await findSection()

      const dialog = await openDialog(user, section, 0)
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
      await within(dialog).findByText('El comentario es obligatorio')

      await user.type(
        within(dialog).getByTestId('objective-override-comment'),
        OVERRIDE_MET.comment
      )
      // El error desaparece al escribir, antes incluso de reenviar
      expect(within(dialog).queryByText('El comentario es obligatorio')).not.toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.llm.overrideObjective)).toHaveBeenCalledWith(
        'i-1',
        0,
        true,
        OVERRIDE_MET.comment
      )
      await waitFor(() =>
        expect(screen.queryByTestId('objective-override-dialog')).not.toBeInTheDocument()
      )
    })
  })

  describe('cancellation and errors', () => {
    // SPEC-028 · AC-13
    it('closes without persisting anything when cancelling, keeping the previous objective state', async () => {
      const user = userEvent.setup()
      const section = await findSection()

      const dialog = await openDialog(user, section, 0)
      await user.type(within(dialog).getByTestId('objective-override-comment'), 'Un comentario')
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

      await waitFor(() =>
        expect(screen.queryByTestId('objective-override-dialog')).not.toBeInTheDocument()
      )
      expect(vi.mocked(mockApi.api.llm.overrideObjective)).not.toHaveBeenCalled()
      within(section)
        .getAllByTestId('objective-item')
        .forEach((item) => expect(item).toHaveAttribute('data-state', 'pending'))
    })

    // SPEC-028 · AC-14
    it('keeps the dialog open with the selection and comment and toasts the error when the rewrite fails', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.llm.overrideObjective).mockResolvedValue({
        ok: false,
        error: { kind: 'connection', message: 'sin conexión con la API' }
      })
      const section = await findSection()

      const dialog = await openDialog(user, section, 0)
      await user.click(within(dialog).getByRole('radio', { name: 'No cumplido' }))
      await user.type(
        within(dialog).getByTestId('objective-override-comment'),
        OVERRIDE_UNMET.comment
      )
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

      const toasts = await screen.findAllByText('No se pudo actualizar el objetivo')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // El diálogo permanece abierto conservando selección y comentario
      expect(screen.getByTestId('objective-override-dialog')).toBeInTheDocument()
      expect(within(dialog).getByRole('radio', { name: 'No cumplido' })).toBeChecked()
      expect(within(dialog).getByTestId('objective-override-comment')).toHaveValue(
        OVERRIDE_UNMET.comment
      )
      // Y Guardar vuelve a estar disponible para reintentar
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeEnabled()
      )
      // El objetivo conserva su estado anterior (nada persistido)
      expect(within(section).getAllByTestId('objective-item')[0]).toHaveAttribute(
        'data-state',
        'pending'
      )
    })
  })
})
