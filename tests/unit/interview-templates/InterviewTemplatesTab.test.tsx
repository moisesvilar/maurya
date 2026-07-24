/**
 * SPEC-051: Unificar la gestión de plantillas en Ajustes.
 * Tests de la pestaña "Plantillas de entrevistas" de Ajustes y su listado
 * (AC-01..AC-16). Reubica y reescribe la cobertura del listado de SPEC-012:
 * el hub y la página desaparecen; las acciones pasan del menú «⋯» a tres
 * botones inline por aria-label. Frontera de mocking: api.db del bridge.
 * Montado con SettingsPage y las rutas reales del editor bajo Ajustes en
 * MemoryRouter, espejo de NoteTemplatesTab.test.tsx.
 */
import React from 'react'
import { render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsPage } from '@/pages/SettingsPage'
import type { InterviewTemplate } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const MDR_TEMPLATE: InterviewTemplate = {
  id: 'tpl-1',
  name: 'Entrevista MDR',
  phase: 'problem',
  blocks: [
    {
      title: 'Contexto',
      guidance: 'Romper el hielo',
      questions: [
        { text: '¿Quién lleva el regulatorio?', guidance: 'Buscar rol' },
        { text: '¿Qué sistemas usáis?' }
      ]
    },
    { title: 'Problema', questions: [{ text: '¿Cuál es la mayor fricción?' }] }
  ],
  createdAt: '2026-07-04T10:00:00.000Z',
  updatedAt: '2026-07-04T10:00:00.000Z'
}

const SIMPLE_TEMPLATE: InterviewTemplate = {
  id: 'tpl-2',
  name: 'Plantilla sin fase',
  phase: null,
  blocks: [{ title: 'Único bloque', questions: [{ text: '¿Única pregunta?' }] }],
  createdAt: '2026-07-04T11:00:00.000Z',
  updatedAt: '2026-07-04T11:00:00.000Z'
}

function setTemplates(templates: InterviewTemplate[]): void {
  vi.mocked(mockApi.api.db.listInterviewTemplates).mockResolvedValue({ ok: true, data: templates })
}

/** Publica location.search para asertar el contrato de deep-link `?tab=` (AC-03). */
function LocationProbe(): React.ReactElement {
  const location = useLocation()
  return <div data-testid="location-search">{location.search}</div>
}

/** Probe del editor por id: refleja el :id para asertar el destino de navegación (AC-11). */
function EditorIdProbe(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  return <div>EDITOR_ID_PROBE:{id}</div>
}

function renderSettings(initialEntry = '/settings'): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/interview-templates/new" element={<div>EDITOR_NEW_PROBE</div>} />
          <Route path="/settings/interview-templates/:id" element={<EditorIdProbe />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  setTemplates([])
})

describe('SettingsPage (pestaña de plantillas de entrevistas)', () => {
  // SPEC-051 · AC-01
  it('shows the four settings tabs in order: Claves de IA, Plantillas de notas, Plantillas de entrevistas, Prompts personalizados', async () => {
    renderSettings()

    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Claves de IA',
      'Plantillas de notas',
      'Plantillas de preguntas',
      'Prompts personalizados'
    ])
  })

  // SPEC-051 · AC-02
  it('activates the "Plantillas de entrevistas" tab and shows its list when loaded with ?tab=interview-templates', async () => {
    setTemplates([MDR_TEMPLATE])
    renderSettings('/settings?tab=interview-templates')

    expect(await screen.findByRole('tab', { name: 'Plantillas de preguntas' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(await screen.findByText('Entrevista MDR')).toBeInTheDocument()
  })

  // SPEC-051 · AC-03
  it('reflects the selected tab in the ?tab= URL parameter when another tab is chosen', async () => {
    const user = userEvent.setup()
    renderSettings('/settings?tab=interview-templates')

    await screen.findByRole('tab', { name: 'Plantillas de preguntas' })
    await user.click(screen.getByRole('tab', { name: 'Plantillas de notas' }))

    expect(screen.getByTestId('location-search')).toHaveTextContent('tab=note-templates')
  })
})

describe('InterviewTemplatesTab (listado)', () => {
  describe('listing templates', () => {
    // SPEC-051 · AC-04 + AC-05
    it('renders each row with name, conditional phase badge and the block/question summary (plural and singular)', async () => {
      setTemplates([MDR_TEMPLATE, SIMPLE_TEMPLATE])
      renderSettings('/settings?tab=interview-templates')

      // Fila con fase: Badge "Problema" y resumen en plural
      const mdrRow = (await screen.findByText('Entrevista MDR')).closest('li')
      if (mdrRow === null) {
        throw new Error('La plantilla debe renderizarse en una fila de lista')
      }
      expect(within(mdrRow).getByText('Problema')).toBeInTheDocument()
      expect(within(mdrRow).getByText('2 bloques · 3 preguntas')).toBeInTheDocument()

      // Fila sin fase (AC-05): sin ningún Badge de fase y resumen en singular
      const simpleRow = screen.getByText('Plantilla sin fase').closest('li')
      if (simpleRow === null) {
        throw new Error('La plantilla debe renderizarse en una fila de lista')
      }
      expect(within(simpleRow).queryByText('Problema')).not.toBeInTheDocument()
      expect(within(simpleRow).queryByText('Exploratoria')).not.toBeInTheDocument()
      expect(within(simpleRow).queryByText('Solución')).not.toBeInTheDocument()
      expect(within(simpleRow).getByText('1 bloque · 1 pregunta')).toBeInTheDocument()

      // Acciones inline por aria-label (no menú «⋯»)
      expect(within(mdrRow).getByRole('button', { name: 'Editar plantilla' })).toBeInTheDocument()
      expect(within(mdrRow).getByRole('button', { name: 'Duplicar plantilla' })).toBeInTheDocument()
      expect(within(mdrRow).getByRole('button', { name: 'Eliminar plantilla' })).toBeInTheDocument()
    })

    // SPEC-051 · AC-06
    it('shows skeletons in the list area while the templates are loading', async () => {
      vi.mocked(mockApi.api.db.listInterviewTemplates).mockReturnValue(
        new Promise<never>(() => undefined)
      )
      const { container } = renderSettings('/settings?tab=interview-templates')

      await screen.findByRole('button', { name: 'Nueva plantilla' })
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
      expect(screen.queryByText('Aún no hay plantillas de preguntas')).not.toBeInTheDocument()
    })

    // SPEC-051 · AC-07
    it('shows the error state with the message and a "Reintentar" button that reloads the list', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.listInterviewTemplates)
        .mockResolvedValueOnce({
          ok: false,
          error: { kind: 'storage', message: 'Fallo simulado al listar plantillas' }
        })
        .mockResolvedValueOnce({ ok: true, data: [] })
      renderSettings('/settings?tab=interview-templates')

      expect(await screen.findByText('Fallo simulado al listar plantillas')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Reintentar' }))

      expect(vi.mocked(mockApi.api.db.listInterviewTemplates)).toHaveBeenCalledTimes(2)
      expect(await screen.findByText('Aún no hay plantillas de preguntas')).toBeInTheDocument()
    })

    // SPEC-051 · AC-08
    it('shows the empty state with its text and the "Crear primera plantilla" CTA when there are none', async () => {
      renderSettings('/settings?tab=interview-templates')

      expect(await screen.findByText('Aún no hay plantillas de preguntas')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear primera plantilla' })).toBeInTheDocument()
    })
  })

  describe('creating and editing', () => {
    // SPEC-051 · AC-09
    it('navigates to /settings/interview-templates/new when "Nueva plantilla" is clicked', async () => {
      const user = userEvent.setup()
      renderSettings('/settings?tab=interview-templates')

      await user.click(await screen.findByRole('button', { name: 'Nueva plantilla' }))

      expect(await screen.findByText('EDITOR_NEW_PROBE')).toBeInTheDocument()
    })

    // SPEC-051 · AC-10
    it('navigates to /settings/interview-templates/new from the empty state CTA', async () => {
      const user = userEvent.setup()
      renderSettings('/settings?tab=interview-templates')

      await user.click(await screen.findByRole('button', { name: 'Crear primera plantilla' }))

      expect(await screen.findByText('EDITOR_NEW_PROBE')).toBeInTheDocument()
    })

    // SPEC-051 · AC-11
    it('navigates to /settings/interview-templates/{id} when "Editar plantilla" is clicked', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE])
      renderSettings('/settings?tab=interview-templates')

      await screen.findByText('Entrevista MDR')
      await user.click(screen.getByRole('button', { name: 'Editar plantilla' }))

      expect(await screen.findByText('EDITOR_ID_PROBE:tpl-1')).toBeInTheDocument()
    })
  })

  describe('duplicating', () => {
    // SPEC-051 · AC-13
    it('duplicates immediately without a dialog, shows the toast and adds the copy to the list', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE])
      vi.mocked(mockApi.api.db.createInterviewTemplate).mockResolvedValue({
        ok: true,
        data: { ...MDR_TEMPLATE, id: 'tpl-copy', name: 'Entrevista MDR (copia)' }
      })
      renderSettings('/settings?tab=interview-templates')

      await screen.findByText('Entrevista MDR')
      await user.click(screen.getByRole('button', { name: 'Duplicar plantilla' }))

      expect(vi.mocked(mockApi.api.db.createInterviewTemplate)).toHaveBeenCalledWith({
        name: 'Entrevista MDR (copia)',
        phase: 'problem',
        blocks: MDR_TEMPLATE.blocks
      })
      const toasts = await screen.findAllByText('Plantilla duplicada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByText('Entrevista MDR (copia)')).toBeInTheDocument()
      // Sin diálogo de confirmación
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  describe('deleting', () => {
    // SPEC-051 · AC-14
    it('opens the "Eliminar plantilla" AlertDialog naming the template, with Cancelar and Eliminar', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE])
      renderSettings('/settings?tab=interview-templates')

      await screen.findByText('Entrevista MDR')
      await user.click(screen.getByRole('button', { name: 'Eliminar plantilla' }))

      const dialog = await screen.findByRole('alertdialog')
      expect(
        within(dialog).getByRole('heading', { name: 'Eliminar plantilla' })
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(/Se eliminará permanentemente la plantilla «Entrevista MDR»\./)
      ).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.deleteInterviewTemplate)).not.toHaveBeenCalled()
    })

    // SPEC-051 · AC-15
    it('deletes the template and removes it from the list after confirming, without reloading', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE, SIMPLE_TEMPLATE])
      vi.mocked(mockApi.api.db.deleteInterviewTemplate).mockResolvedValue({ ok: true, data: null })
      renderSettings('/settings?tab=interview-templates')

      await screen.findByText('Entrevista MDR')
      await user.click(screen.getAllByRole('button', { name: 'Eliminar plantilla' })[0])
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

      expect(vi.mocked(mockApi.api.db.deleteInterviewTemplate)).toHaveBeenCalledWith('tpl-1')
      const toasts = await screen.findAllByText('Plantilla eliminada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Entrevista MDR')).not.toBeInTheDocument()
      // El listado sigue montado (sin recarga): la otra plantilla permanece
      expect(screen.getByText('Plantilla sin fase')).toBeInTheDocument()
    })

    // SPEC-051 · AC-16
    it('keeps the template when the deletion is cancelled and nothing is deleted', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE])
      renderSettings('/settings?tab=interview-templates')

      await screen.findByText('Entrevista MDR')
      await user.click(screen.getByRole('button', { name: 'Eliminar plantilla' }))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

      expect(vi.mocked(mockApi.api.db.deleteInterviewTemplate)).not.toHaveBeenCalled()
      expect(screen.getByText('Entrevista MDR')).toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  describe('mutation errors', () => {
    // SPEC-012 · AC-20 (funcionalidad conservada por SPEC-051): fallo de mutación
    it('shows an error toast and leaves the list untouched when a mutation fails', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE])
      vi.mocked(mockApi.api.db.createInterviewTemplate).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'Fallo simulado al duplicar' }
      })
      renderSettings('/settings?tab=interview-templates')

      await screen.findByText('Entrevista MDR')
      await user.click(screen.getByRole('button', { name: 'Duplicar plantilla' }))

      const toasts = await screen.findAllByText('Fallo simulado al duplicar')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // Listado intacto: una sola fila (los toasts de sonner también son <li>,
      // por eso se cuenta por el texto de la fila, no por listitems globales)
      expect(screen.getAllByText('Entrevista MDR')).toHaveLength(1)
      expect(screen.queryByText('Entrevista MDR (copia)')).not.toBeInTheDocument()
    })
  })
})
