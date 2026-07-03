/**
 * Tests del editor de plantillas de notas (SPEC-008, AC-08..AC-19). Frontera
 * de mocking: api.db del bridge. Montado en MemoryRouter con una ruta probe en
 * /settings (el editor navega a /settings?tab=note-templates al salir).
 */
import { render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NoteTemplateEditorPage } from '@/pages/NoteTemplateEditorPage'
import type { NoteTemplate } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const EXISTING: NoteTemplate = {
  id: 'tpl-1',
  name: 'Plantilla Discovery',
  context: 'Contexto original',
  sections: [
    { title: 'Sección A', description: 'desc A' },
    { title: 'Sección B', description: 'desc B' },
    { title: 'Sección C', description: 'desc C' }
  ],
  createdAt: '2026-07-04T10:00:00.000Z',
  updatedAt: '2026-07-04T10:00:00.000Z'
}

function renderEditor(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/settings" element={<div>LIST_PROBE</div>} />
          <Route path="/settings/note-templates/new" element={<NoteTemplateEditorPage />} />
          <Route path="/settings/note-templates/:id" element={<NoteTemplateEditorPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

function sectionTitleInputs(): HTMLElement[] {
  return screen.getAllByLabelText('Título')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getNoteTemplate).mockResolvedValue({ ok: true, data: EXISTING })
  vi.mocked(mockApi.api.db.createNoteTemplate).mockResolvedValue({
    ok: true,
    data: { ...EXISTING, id: 'tpl-new' }
  })
  vi.mocked(mockApi.api.db.updateNoteTemplate).mockResolvedValue({ ok: true, data: EXISTING })
})

describe('NoteTemplateEditorPage', () => {
  describe('creating a template', () => {
    // SPEC-008 · AC-08
    it('persists the new template with ordered sections, shows the "Plantilla creada" toast and returns to the list', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/new')

      await user.type(screen.getByLabelText('Nombre'), 'Problem Discovery')
      await user.type(screen.getByLabelText('Contexto'), 'Instrucciones de extracción')
      await user.type(sectionTitleInputs()[0], 'Dolores')
      await user.click(screen.getByRole('button', { name: 'Añadir sección' }))
      await user.type(sectionTitleInputs()[1], 'Citas')

      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.createNoteTemplate)).toHaveBeenCalledWith({
        name: 'Problem Discovery',
        context: 'Instrucciones de extracción',
        sections: [
          { title: 'Dolores', description: '' },
          { title: 'Citas', description: '' }
        ]
      })
      const toasts = await screen.findAllByText('Plantilla creada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByText('LIST_PROBE')).toBeInTheDocument()
    })
  })

  describe('editing a template', () => {
    // SPEC-008 · AC-09
    it('opens preloaded with the name, context and sections in their stored order', async () => {
      renderEditor('/settings/note-templates/tpl-1')

      expect(await screen.findByRole('heading', { name: 'Editar plantilla' })).toBeInTheDocument()
      expect(await screen.findByLabelText('Nombre')).toHaveValue('Plantilla Discovery')
      expect(screen.getByLabelText('Contexto')).toHaveValue('Contexto original')
      const titles = sectionTitleInputs()
      expect(titles.map((input) => (input as HTMLInputElement).value)).toEqual([
        'Sección A',
        'Sección B',
        'Sección C'
      ])
      expect(screen.getAllByLabelText('Descripción')[0]).toHaveValue('desc A')
    })

    // SPEC-008 · AC-10
    it('persists the edited section title via updateNoteTemplate, shows "Cambios guardados" and returns to the list', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/tpl-1')

      const firstTitle = (await screen.findAllByLabelText('Título'))[0]
      await user.clear(firstTitle)
      await user.type(firstTitle, 'Sección A editada')
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.updateNoteTemplate)).toHaveBeenCalledWith('tpl-1', {
        name: 'Plantilla Discovery',
        context: 'Contexto original',
        sections: [
          { title: 'Sección A editada', description: 'desc A' },
          { title: 'Sección B', description: 'desc B' },
          { title: 'Sección C', description: 'desc C' }
        ]
      })
      const toasts = await screen.findAllByText('Cambios guardados')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByText('LIST_PROBE')).toBeInTheDocument()
    })
  })

  describe('managing sections', () => {
    // SPEC-008 · AC-11
    it('adds a blank section at the end and moves the focus to its title field', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/new')

      await user.click(screen.getByRole('button', { name: 'Añadir sección' }))

      const titles = sectionTitleInputs()
      expect(titles).toHaveLength(2)
      expect(titles[1]).toHaveValue('')
      expect(document.activeElement).toBe(titles[1])
    })

    // SPEC-008 · AC-12 (reordenación + extremo superior)
    // Lección jsdom+Radix: el grace area de TooltipContentHoverable usa
    // getBoundingClientRect (rects 0,0,0,0 en jsdom) y tras el primer unhover
    // el flag isPointerInTransit del TooltipProvider queda anclado → máximo
    // UN hover de tooltip por render. Por eso este AC se divide en dos its.
    it('moves a middle section up swapping with the previous one, and the first "Subir sección" is disabled with tooltip', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/tpl-1')
      await screen.findAllByLabelText('Título')

      // Subir la sección intermedia (B) la intercambia con la anterior (A)
      await user.click(screen.getAllByRole('button', { name: 'Subir sección' })[1])
      expect(sectionTitleInputs().map((input) => (input as HTMLInputElement).value)).toEqual([
        'Sección B',
        'Sección A',
        'Sección C'
      ])

      // El subir de la primera fila queda deshabilitado con Tooltip
      const firstUp = screen.getAllByRole('button', { name: 'Subir sección' })[0]
      expect(firstUp).toBeDisabled()
      const firstUpWrapper = firstUp.parentElement
      if (firstUpWrapper === null) {
        throw new Error('El botón subir deshabilitado debe estar envuelto por el TooltipTrigger')
      }
      await user.hover(firstUpWrapper)
      expect(
        (await screen.findAllByText('Ya es la primera sección')).length
      ).toBeGreaterThanOrEqual(1)
    })

    // SPEC-008 · AC-12 (extremo inferior; render propio: máx 1 tooltip por montaje)
    it('disables the "Bajar sección" button of the last section with its tooltip', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/tpl-1')
      await screen.findAllByLabelText('Título')

      const lastDown = screen.getAllByRole('button', { name: 'Bajar sección' })[2]
      expect(lastDown).toBeDisabled()
      const lastDownWrapper = lastDown.parentElement
      if (lastDownWrapper === null) {
        throw new Error('El botón bajar deshabilitado debe estar envuelto por el TooltipTrigger')
      }
      await user.hover(lastDownWrapper)
      expect((await screen.findAllByText('Ya es la última sección')).length).toBeGreaterThanOrEqual(
        1
      )
    })

    // SPEC-008 · AC-13
    it('removes a section without any confirmation dialog when there are two or more', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/new')
      await user.click(screen.getByRole('button', { name: 'Añadir sección' }))
      await user.type(sectionTitleInputs()[0], 'Primera')
      await user.type(sectionTitleInputs()[1], 'Segunda')

      await user.click(screen.getAllByRole('button', { name: 'Eliminar sección' })[0])

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      const titles = sectionTitleInputs()
      expect(titles).toHaveLength(1)
      expect(titles[0]).toHaveValue('Segunda')
    })

    // SPEC-008 · AC-14
    it('disables the remove button of the only section with the literal tooltip', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/new')

      const removeButton = screen.getByRole('button', { name: 'Eliminar sección' })
      expect(removeButton).toBeDisabled()

      const wrapper = removeButton.parentElement
      if (wrapper === null) {
        throw new Error('El botón eliminar deshabilitado debe estar envuelto por el TooltipTrigger')
      }
      await user.hover(wrapper)
      const tooltips = await screen.findAllByText('La plantilla necesita al menos una sección')
      expect(tooltips.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('validation', () => {
    // SPEC-008 · AC-15
    it('shows the inline "Campo requerido" error under the empty name and does not persist', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/new')
      await user.type(sectionTitleInputs()[0], 'Sección válida')

      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()
      expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
      expect(vi.mocked(mockApi.api.db.createNoteTemplate)).not.toHaveBeenCalled()
    })

    // SPEC-008 · AC-16
    it('shows the inline "Campo requerido" error under an empty section title and does not persist', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/new')
      await user.type(screen.getByLabelText('Nombre'), 'Con nombre válido')

      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()
      expect(sectionTitleInputs()[0]).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'false')
      expect(vi.mocked(mockApi.api.db.createNoteTemplate)).not.toHaveBeenCalled()
    })

    // SPEC-008 · AC-17
    it('saves normally with an empty context (the context is optional)', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/new')
      await user.type(screen.getByLabelText('Nombre'), 'Sin contexto')
      await user.type(sectionTitleInputs()[0], 'Única sección')

      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.createNoteTemplate)).toHaveBeenCalledWith({
        name: 'Sin contexto',
        context: '',
        sections: [{ title: 'Única sección', description: '' }]
      })
      const toasts = await screen.findAllByText('Plantilla creada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('leaving the editor', () => {
    // SPEC-008 · AC-18
    it('shows the "Descartar cambios" AlertDialog when leaving with unsaved changes, and confirming discards and returns', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/new')
      await user.type(screen.getByLabelText('Nombre'), 'Cambio sin guardar')

      await user.click(screen.getByRole('button', { name: 'Volver' }))

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Descartar cambios' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Descartar' }))

      expect(await screen.findByText('LIST_PROBE')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.createNoteTemplate)).not.toHaveBeenCalled()
    })

    // SPEC-008 · AC-19
    it('returns directly to the list without any dialog when there are no changes', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/note-templates/new')

      await user.click(screen.getByRole('button', { name: 'Volver' }))

      expect(await screen.findByText('LIST_PROBE')).toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })
})
