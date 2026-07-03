/**
 * Tests de las pestañas de Ajustes y del listado de plantillas de notas
 * (SPEC-008, AC-01..AC-07 y AC-20/AC-21). Frontera de mocking: api.db y
 * api.secrets del bridge. Montado con las rutas reales en MemoryRouter para
 * poder asertar la navegación al editor.
 */
import { render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NoteTemplateEditorPage } from '@/pages/NoteTemplateEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import type { NoteTemplate } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

function template(id: string, name: string, sectionCount: number): NoteTemplate {
  return {
    id,
    name,
    context: 'Contexto de prueba',
    sections: Array.from({ length: sectionCount }, (_, index) => ({
      title: `Sección ${index + 1}`,
      description: `Descripción ${index + 1}`
    })),
    createdAt: '2026-07-04T10:00:00.000Z',
    updatedAt: '2026-07-04T10:00:00.000Z'
  }
}

function renderSettings(initialEntry = '/settings'): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<div>HARNESS_PROBE</div>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/note-templates/new" element={<NoteTemplateEditorPage />} />
          <Route path="/settings/note-templates/:id" element={<NoteTemplateEditorPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

function setTemplates(templates: NoteTemplate[]): void {
  vi.mocked(mockApi.api.db.listNoteTemplates).mockResolvedValue({ ok: true, data: templates })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  setTemplates([])
})

describe('SettingsPage (tabs de Ajustes)', () => {
  describe('navigation', () => {
    // SPEC-008 · AC-01
    it('shows the "Claves de IA" and "Plantillas de notas" tabs with the API keys tab active by default', async () => {
      renderSettings()

      const apiKeysTab = await screen.findByRole('tab', { name: 'Claves de IA' })
      const templatesTab = screen.getByRole('tab', { name: 'Plantillas de notas' })
      expect(apiKeysTab).toHaveAttribute('aria-selected', 'true')
      expect(templatesTab).toHaveAttribute('aria-selected', 'false')
      // Contenido de la pestaña activa (SPEC-007 intacto)
      expect(
        screen.getByText(
          'Las claves se guardan cifradas en este equipo y nunca vuelven a mostrarse.'
        )
      ).toBeInTheDocument()
      // La pestaña inactiva está desmontada: el listado aún no se ha pedido
      expect(vi.mocked(mockApi.api.db.listNoteTemplates)).not.toHaveBeenCalled()
    })

    // SPEC-008 · AC-02
    it('shows the templates list without reloading the page when the tab is selected', async () => {
      const user = userEvent.setup()
      renderSettings()

      expect(vi.mocked(mockApi.api.db.listNoteTemplates)).not.toHaveBeenCalled()
      await user.click(await screen.findByRole('tab', { name: 'Plantillas de notas' }))

      expect(
        await screen.findByText('Moldes con los que se redactará el resumen de cada entrevista')
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Nueva plantilla' })).toBeInTheDocument()
      // Sin recarga: la misma página de Ajustes sigue montada
      expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.listNoteTemplates)).toHaveBeenCalledTimes(1)
    })
  })
})

describe('NoteTemplatesTab (listado)', () => {
  describe('listing templates', () => {
    // SPEC-008 · AC-03
    it('renders each row with name, section count and the Editar/Eliminar inline actions', async () => {
      setTemplates([template('tpl-a', 'Plantilla A', 6), template('tpl-b', 'Plantilla B', 1)])
      renderSettings('/settings?tab=note-templates')

      expect(await screen.findByText('Plantilla A')).toBeInTheDocument()
      expect(screen.getByText('6 secciones')).toBeInTheDocument()
      expect(screen.getByText('Plantilla B')).toBeInTheDocument()
      expect(screen.getByText('1 sección')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Editar plantilla' })).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'Eliminar plantilla' })).toHaveLength(2)
    })

    // SPEC-008 · AC-04
    it('shows the empty state with its text and the "Crear primera plantilla" CTA when there are no templates', async () => {
      renderSettings('/settings?tab=note-templates')

      expect(await screen.findByText('Aún no hay plantillas de notas')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear primera plantilla' })).toBeInTheDocument()
    })

    // SPEC-008 · AC-05
    it('shows skeletons in the list area while the templates are loading', async () => {
      vi.mocked(mockApi.api.db.listNoteTemplates).mockReturnValue(
        new Promise<never>(() => undefined)
      )
      const { container } = renderSettings('/settings?tab=note-templates')

      await screen.findByRole('button', { name: 'Nueva plantilla' })
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
      expect(screen.queryByText('Aún no hay plantillas de notas')).not.toBeInTheDocument()
    })

    // SPEC-008 · AC-06
    it('shows the error state with the message and a "Reintentar" button that reloads the list', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.listNoteTemplates)
        .mockResolvedValueOnce({
          ok: false,
          error: { kind: 'storage', message: 'Fallo simulado al listar' }
        })
        .mockResolvedValueOnce({ ok: true, data: [] })
      renderSettings('/settings?tab=note-templates')

      expect(await screen.findByText('Fallo simulado al listar')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Reintentar' }))

      expect(vi.mocked(mockApi.api.db.listNoteTemplates)).toHaveBeenCalledTimes(2)
      expect(await screen.findByText('Aún no hay plantillas de notas')).toBeInTheDocument()
    })
  })

  describe('creating from the list', () => {
    // SPEC-008 · AC-07
    it('navigates to the empty editor with one blank initial section when "Nueva plantilla" is clicked', async () => {
      const user = userEvent.setup()
      renderSettings('/settings?tab=note-templates')

      await user.click(await screen.findByRole('button', { name: 'Nueva plantilla' }))

      expect(await screen.findByRole('heading', { name: 'Nueva plantilla' })).toBeInTheDocument()
      expect(screen.getByLabelText('Nombre')).toHaveValue('')
      const sectionTitles = screen.getAllByLabelText('Título')
      expect(sectionTitles).toHaveLength(1)
      expect(sectionTitles[0]).toHaveValue('')
    })
  })

  describe('deleting a template', () => {
    // SPEC-008 · AC-20
    it('opens the "Eliminar plantilla" AlertDialog naming the template, with Cancelar and Eliminar', async () => {
      const user = userEvent.setup()
      setTemplates([template('tpl-a', 'Plantilla A', 6), template('tpl-b', 'Plantilla B', 1)])
      renderSettings('/settings?tab=note-templates')

      await screen.findByText('Plantilla A')
      await user.click(screen.getAllByRole('button', { name: 'Eliminar plantilla' })[0])

      const dialog = await screen.findByRole('alertdialog')
      expect(
        within(dialog).getByRole('heading', { name: 'Eliminar plantilla' })
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(/Se eliminará permanentemente la plantilla «Plantilla A»\./)
      ).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.deleteNoteTemplate)).not.toHaveBeenCalled()
    })

    // SPEC-008 · AC-21
    it('removes the row and shows the "Plantilla eliminada" toast after confirming the deletion', async () => {
      const user = userEvent.setup()
      setTemplates([template('tpl-a', 'Plantilla A', 6), template('tpl-b', 'Plantilla B', 1)])
      vi.mocked(mockApi.api.db.deleteNoteTemplate).mockResolvedValue({ ok: true, data: null })
      renderSettings('/settings?tab=note-templates')

      await screen.findByText('Plantilla A')
      await user.click(screen.getAllByRole('button', { name: 'Eliminar plantilla' })[0])
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

      expect(vi.mocked(mockApi.api.db.deleteNoteTemplate)).toHaveBeenCalledWith('tpl-a')
      const toasts = await screen.findAllByText('Plantilla eliminada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Plantilla A')).not.toBeInTheDocument()
      expect(screen.getByText('Plantilla B')).toBeInTheDocument()
    })
  })
})
