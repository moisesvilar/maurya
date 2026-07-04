/**
 * Tests del listado de plantillas de entrevista (SPEC-012, AC-01..AC-04 y
 * AC-18..AC-20). Frontera de mocking: api.db. Rutas reales en MemoryRouter
 * (hub + listado). Lecciones aplicadas: delete diferido con setTimeout(0) →
 * findBy*; fondo aria-hidden con dialog abierto; sonner tolerante.
 */
import { render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InterviewTemplatesPage } from '@/pages/InterviewTemplatesPage'
import { TemplatesHubPage } from '@/pages/TemplatesHubPage'
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
  vi.mocked(mockApi.api.db.listInterviewTemplates).mockResolvedValue({
    ok: true,
    data: templates
  })
}

function renderAt(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/templates" element={<TemplatesHubPage />} />
          <Route path="/templates/interview" element={<InterviewTemplatesPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/** Abre una acción del menú ⋯ de la primera fila (delete diferido setTimeout(0)). */
async function openRowAction(
  user: ReturnType<typeof userEvent.setup>,
  action: 'Editar' | 'Duplicar' | 'Eliminar'
): Promise<void> {
  await user.click((await screen.findAllByRole('button', { name: 'Acciones' }))[0])
  await user.click(await screen.findByRole('menuitem', { name: action }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  setTemplates([])
})

describe('InterviewTemplatesPage', () => {
  describe('access from the hub', () => {
    // SPEC-012 · AC-01
    it('navigates from the functional hub card to the interview templates list', async () => {
      const user = userEvent.setup()
      renderAt('/templates')

      expect(screen.queryByText('Disponible próximamente')).not.toBeInTheDocument()
      const interviewLink = screen.getByText('Plantillas de entrevista').closest('a')
      if (interviewLink === null) {
        throw new Error('La card de Plantillas de entrevista debe ser un enlace')
      }
      await user.click(interviewLink)

      expect(await screen.findByText('Aún no hay plantillas de entrevista')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Nueva plantilla' })).toBeInTheDocument()
    })
  })

  describe('listing', () => {
    // SPEC-012 · AC-02
    it('renders each row with name, conditional phase badge, block/question summary and the actions menu', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE, SIMPLE_TEMPLATE])
      renderAt('/templates/interview')

      // Fila con fase: Badge "Problema" y resumen en plural
      const mdrRow = (await screen.findByText('Entrevista MDR')).closest('li')
      if (mdrRow === null) {
        throw new Error('La plantilla debe renderizarse en una fila de lista')
      }
      expect(within(mdrRow).getByText('Problema')).toBeInTheDocument()
      expect(within(mdrRow).getByText('2 bloques · 3 preguntas')).toBeInTheDocument()

      // Fila sin fase: sin Badge y resumen en singular
      const simpleRow = screen.getByText('Plantilla sin fase').closest('li')
      if (simpleRow === null) {
        throw new Error('La plantilla debe renderizarse en una fila de lista')
      }
      expect(within(simpleRow).queryByText('Problema')).not.toBeInTheDocument()
      expect(within(simpleRow).queryByText('Exploratoria')).not.toBeInTheDocument()
      expect(within(simpleRow).queryByText('Solución')).not.toBeInTheDocument()
      expect(within(simpleRow).getByText('1 bloque · 1 pregunta')).toBeInTheDocument()

      // Menú de acciones con Editar / Duplicar / Eliminar
      await user.click(within(mdrRow).getByRole('button', { name: 'Acciones' }))
      expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Duplicar' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toBeInTheDocument()
    })

    // SPEC-012 · AC-03
    it('shows the empty state with the "Crear primera plantilla" CTA when there are none', async () => {
      renderAt('/templates/interview')

      expect(await screen.findByText('Aún no hay plantillas de entrevista')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear primera plantilla' })).toBeInTheDocument()
    })

    // SPEC-012 · AC-04
    it('shows skeletons while loading and the error state with a working "Reintentar"', async () => {
      const user = userEvent.setup()

      // Escenario 1: carga pendiente → skeletons
      vi.mocked(mockApi.api.db.listInterviewTemplates).mockReturnValue(
        new Promise<never>(() => undefined)
      )
      const { container, unmount } = renderAt('/templates/interview')
      await screen.findByRole('button', { name: 'Nueva plantilla' })
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
      unmount()

      // Escenario 2: error del bridge → mensaje + Reintentar rellama
      vi.mocked(mockApi.api.db.listInterviewTemplates)
        .mockResolvedValueOnce({
          ok: false,
          error: { kind: 'storage', message: 'Fallo simulado al listar plantillas' }
        })
        .mockResolvedValueOnce({ ok: true, data: [] })
      renderAt('/templates/interview')
      expect(await screen.findByText('Fallo simulado al listar plantillas')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByText('Aún no hay plantillas de entrevista')).toBeInTheDocument()
    })
  })

  describe('duplicating', () => {
    // SPEC-012 · AC-18
    it('creates an immediate full copy named "«nombre» (copia)" with the blocks as-is and shows the toast', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE])
      vi.mocked(mockApi.api.db.createInterviewTemplate).mockResolvedValue({
        ok: true,
        data: { ...MDR_TEMPLATE, id: 'tpl-copy', name: 'Entrevista MDR (copia)' }
      })
      renderAt('/templates/interview')

      await openRowAction(user, 'Duplicar')

      expect(vi.mocked(mockApi.api.db.createInterviewTemplate)).toHaveBeenCalledWith({
        name: 'Entrevista MDR (copia)',
        phase: 'problem',
        blocks: MDR_TEMPLATE.blocks
      })
      const toasts = await screen.findAllByText('Plantilla duplicada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByText('Entrevista MDR (copia)')).toBeInTheDocument()
    })
  })

  describe('deleting', () => {
    // SPEC-012 · AC-19
    it('confirms in the "Eliminar plantilla" AlertDialog, deletes and shows "Plantilla eliminada"', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE])
      vi.mocked(mockApi.api.db.deleteInterviewTemplate).mockResolvedValue({ ok: true, data: null })
      renderAt('/templates/interview')

      await openRowAction(user, 'Eliminar')

      const dialog = await screen.findByRole('alertdialog')
      expect(
        within(dialog).getByRole('heading', { name: 'Eliminar plantilla' })
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(/Se eliminará permanentemente la plantilla «Entrevista MDR»\./)
      ).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

      expect(vi.mocked(mockApi.api.db.deleteInterviewTemplate)).toHaveBeenCalledWith('tpl-1')
      const toasts = await screen.findAllByText('Plantilla eliminada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Entrevista MDR')).not.toBeInTheDocument()
    })
  })

  describe('mutation errors', () => {
    // SPEC-012 · AC-20
    it('shows an error toast and leaves the list untouched when a mutation fails', async () => {
      const user = userEvent.setup()
      setTemplates([MDR_TEMPLATE])
      vi.mocked(mockApi.api.db.createInterviewTemplate).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'Fallo simulado al duplicar' }
      })
      renderAt('/templates/interview')

      await openRowAction(user, 'Duplicar')

      const toasts = await screen.findAllByText('Fallo simulado al duplicar')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // Listado intacto: una sola fila. Ojo: los toasts de sonner también son
      // <li> → no contar listitems globales; se cuenta por el texto de la fila
      expect(screen.getAllByText('Entrevista MDR')).toHaveLength(1)
      expect(screen.queryByText('Entrevista MDR (copia)')).not.toBeInTheDocument()
    })
  })
})
