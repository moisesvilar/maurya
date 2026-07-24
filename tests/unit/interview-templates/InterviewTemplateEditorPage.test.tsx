/**
 * Tests del editor de plantillas de entrevista. Cubre los ACs conservados de
 * SPEC-012 (AC-05..AC-17: estructura, reordenación, guardado, validación,
 * guard de descarte y edición) y el AC-12 de SPEC-051 (el editor cuelga de
 * `/settings/interview-templates/*` y su salida regresa a la pestaña
 * "Plantillas de entrevistas" de Ajustes).
 * Frontera de mocking: api.db (getInterviewTemplate por test, sin default). El
 * destino de salida es SettingsPage real, para asertar la pestaña activa.
 * Lecciones aplicadas: máximo 1 hover de tooltip por render (grace area de
 * Radix anclado en jsdom) → los ACs de tooltips se dividen en its.
 */
import { render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InterviewTemplateEditorPage } from '@/pages/InterviewTemplateEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import type { InterviewTemplate } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

/** Fixture 2 bloques × 2 preguntas para reordenación acotada por nivel. */
const EXISTING: InterviewTemplate = {
  id: 'tpl-1',
  name: 'Plantilla base',
  phase: 'problem',
  blocks: [
    {
      title: 'Bloque A',
      guidance: 'Guía A',
      questions: [{ text: 'Pregunta A1', guidance: 'Guía A1' }, { text: 'Pregunta A2' }]
    },
    { title: 'Bloque B', questions: [{ text: 'Pregunta B1' }, { text: 'Pregunta B2' }] }
  ],
  createdAt: '2026-07-04T10:00:00.000Z',
  updatedAt: '2026-07-04T10:00:00.000Z'
}

function renderEditor(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/settings/interview-templates/new"
            element={<InterviewTemplateEditorPage />}
          />
          <Route
            path="/settings/interview-templates/:id"
            element={<InterviewTemplateEditorPage />}
          />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/** Aserta que la salida del editor aterrizó en la pestaña de plantillas de entrevistas. */
async function expectBackOnInterviewTemplatesTab(): Promise<void> {
  expect(await screen.findByRole('tab', { name: 'Plantillas de entrevistas' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
}

function inputValues(label: string): string[] {
  return screen.getAllByLabelText(label).map((input) => (input as HTMLInputElement).value)
}

/** Espera y devuelve el wrapper (span TooltipTrigger) de un botón deshabilitado. */
function tooltipWrapperOf(button: HTMLElement): HTMLElement {
  const wrapper = button.parentElement
  if (wrapper === null) {
    throw new Error('El botón deshabilitado debe estar envuelto por el TooltipTrigger')
  }
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getInterviewTemplate).mockResolvedValue({ ok: true, data: EXISTING })
})

describe('InterviewTemplateEditorPage', () => {
  describe('new template', () => {
    // SPEC-012 · AC-05
    it('opens the empty editor with one initial block containing one blank question', () => {
      renderEditor('/settings/interview-templates/new')

      expect(screen.getByRole('heading', { name: 'Nueva plantilla' })).toBeInTheDocument()
      const blockTitles = screen.getAllByLabelText('Título')
      expect(blockTitles).toHaveLength(1)
      expect(blockTitles[0]).toHaveValue('')
      const questionTexts = screen.getAllByLabelText('Pregunta')
      expect(questionTexts).toHaveLength(1)
      expect(questionTexts[0]).toHaveValue('')
    })

    // SPEC-012 · AC-06
    it('presents the name field, the optional phase select and the blocks list', () => {
      renderEditor('/settings/interview-templates/new')

      expect(screen.getByLabelText('Nombre')).toHaveAttribute(
        'placeholder',
        'Entrevista de problema — MDR'
      )
      // Select de fase con "Sin fase" por defecto y ayuda metodológica
      const phaseTrigger = screen.getByRole('combobox', { name: 'Fase' })
      expect(phaseTrigger).toHaveTextContent('Sin fase')
      expect(
        screen.getByText('Marco metodológico del cuestionario (The Mom Test / Running Lean)')
      ).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Bloques' })).toBeInTheDocument()
    })

    // SPEC-012 · AC-07
    it('renders the block card with header, title, block guidance, questions section and actions', () => {
      renderEditor('/settings/interview-templates/new')

      expect(screen.getByText('Bloque 1')).toBeInTheDocument()
      expect(screen.getByLabelText('Título')).toHaveAttribute(
        'placeholder',
        'Contexto y sistemas (5-7 min)'
      )
      expect(screen.getByLabelText('Guía del bloque')).toHaveAttribute(
        'placeholder',
        'Propósito, tiempo, señales de alarma…'
      )
      expect(screen.getByRole('heading', { name: 'Preguntas', level: 4 })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Subir bloque' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Bajar bloque' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Eliminar bloque' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Añadir pregunta' })).toBeInTheDocument()
    })

    // SPEC-012 · AC-08
    it('renders the question row with text, question guidance and its own actions', () => {
      renderEditor('/settings/interview-templates/new')

      expect(screen.getByLabelText('Pregunta')).toHaveAttribute(
        'placeholder',
        '¿Quién lleva hoy el regulatorio y calidad?'
      )
      expect(screen.getByLabelText('Guía de la pregunta')).toHaveAttribute(
        'placeholder',
        'Qué buscar en la respuesta…'
      )
      expect(screen.getByRole('button', { name: 'Subir pregunta' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Bajar pregunta' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Eliminar pregunta' })).toBeInTheDocument()
    })

    // SPEC-012 · AC-09
    it('adds an empty block at the end (with a blank question) and focuses its title', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/interview-templates/new')

      await user.click(screen.getByRole('button', { name: 'Añadir bloque' }))

      const blockTitles = screen.getAllByLabelText('Título')
      expect(blockTitles).toHaveLength(2)
      expect(blockTitles[1]).toHaveValue('')
      expect(screen.getAllByLabelText('Pregunta')).toHaveLength(2)
      expect(document.activeElement).toBe(blockTitles[1])
    })

    // SPEC-012 · AC-10
    it('adds an empty question at the end of the block and focuses its text', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/interview-templates/new')

      await user.click(screen.getByRole('button', { name: 'Añadir pregunta' }))

      const questionTexts = screen.getAllByLabelText('Pregunta')
      expect(questionTexts).toHaveLength(2)
      expect(questionTexts[1]).toHaveValue('')
      expect(document.activeElement).toBe(questionTexts[1])
    })
  })

  describe('reordering (2 bloques × 2 preguntas)', () => {
    // SPEC-012 · AC-11 (bloques; 1 solo hover de tooltip por render)
    it('swaps blocks with their questions when moved up, disabling the first-block-up with tooltip', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/interview-templates/tpl-1')
      await screen.findAllByLabelText('Título')

      await user.click(screen.getAllByRole('button', { name: 'Subir bloque' })[1])

      expect(inputValues('Título')).toEqual(['Bloque B', 'Bloque A'])
      // Las preguntas viajan con su bloque
      expect(inputValues('Pregunta')).toEqual([
        'Pregunta B1',
        'Pregunta B2',
        'Pregunta A1',
        'Pregunta A2'
      ])

      const firstUp = screen.getAllByRole('button', { name: 'Subir bloque' })[0]
      expect(firstUp).toBeDisabled()
      await user.hover(tooltipWrapperOf(firstUp))
      expect((await screen.findAllByText('Ya es el primer bloque')).length).toBeGreaterThanOrEqual(
        1
      )
    })

    // SPEC-012 · AC-11 (preguntas acotadas por nivel; 1 solo hover por render)
    it('moves a question within its block without crossing block boundaries, with per-block disabled extremes', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/interview-templates/tpl-1')
      await screen.findAllByLabelText('Pregunta')

      // Bajar A1: intercambia con A2 dentro del bloque A; el bloque B no cambia
      await user.click(screen.getAllByRole('button', { name: 'Bajar pregunta' })[0])
      expect(inputValues('Pregunta')).toEqual([
        'Pregunta A2',
        'Pregunta A1',
        'Pregunta B1',
        'Pregunta B2'
      ])

      // A1 es ahora la última de SU bloque: su bajar queda deshabilitado aunque
      // haya más preguntas después (límite por nivel, no global)
      const downButtons = screen.getAllByRole('button', { name: 'Bajar pregunta' })
      expect(downButtons[1]).toBeDisabled()
      // Y B1 (globalmente tercera) tiene su subir deshabilitado: es la primera de su bloque
      const upButtons = screen.getAllByRole('button', { name: 'Subir pregunta' })
      expect(upButtons[2]).toBeDisabled()
      await user.hover(tooltipWrapperOf(upButtons[2]))
      expect(
        (await screen.findAllByText('Ya es la primera pregunta')).length
      ).toBeGreaterThanOrEqual(1)
    })

    // SPEC-012 · AC-12 (único bloque; 1 solo hover por render)
    it('disables removing the only block with its literal tooltip', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/interview-templates/new')

      const removeBlock = screen.getByRole('button', { name: 'Eliminar bloque' })
      expect(removeBlock).toBeDisabled()
      await user.hover(tooltipWrapperOf(removeBlock))
      expect(
        (await screen.findAllByText('La plantilla necesita al menos un bloque')).length
      ).toBeGreaterThanOrEqual(1)
    })

    // SPEC-012 · AC-12 (única pregunta; 1 solo hover por render)
    it('disables removing the only question of a block with its literal tooltip', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/interview-templates/new')

      const removeQuestion = screen.getByRole('button', { name: 'Eliminar pregunta' })
      expect(removeQuestion).toBeDisabled()
      await user.hover(tooltipWrapperOf(removeQuestion))
      expect(
        (await screen.findAllByText('El bloque necesita al menos una pregunta')).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  describe('saving', () => {
    // SPEC-012 · AC-13 + SPEC-051 · AC-12 (salida por guardado → pestaña de Ajustes)
    it('persists the exact visual order omitting empty guidance keys, shows the toast and returns to the interview-templates tab', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.createInterviewTemplate).mockResolvedValue({
        ok: true,
        data: { ...EXISTING, id: 'tpl-new' }
      })
      renderEditor('/settings/interview-templates/new')

      await user.type(screen.getByLabelText('Nombre'), 'Entrevista de problema')
      // Fase vía Select: "Problema"
      await user.click(screen.getByRole('combobox', { name: 'Fase' }))
      await user.click(await screen.findByRole('option', { name: 'Problema' }))
      await user.type(screen.getByLabelText('Título'), 'Contexto')
      await user.type(screen.getByLabelText('Guía del bloque'), 'Guía con contenido')
      await user.type(screen.getAllByLabelText('Pregunta')[0], '¿Quién lleva el regulatorio?')
      await user.click(screen.getByRole('button', { name: 'Añadir pregunta' }))
      await user.type(screen.getAllByLabelText('Pregunta')[1], '¿Qué sistemas usáis?')

      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.createInterviewTemplate)).toHaveBeenCalledWith({
        name: 'Entrevista de problema',
        phase: 'problem',
        blocks: [
          {
            title: 'Contexto',
            guidance: 'Guía con contenido',
            questions: [{ text: '¿Quién lleva el regulatorio?' }, { text: '¿Qué sistemas usáis?' }]
          }
        ]
      })
      // La guidance vacía se OMITE (la clave no existe, no viaja como '' ni null)
      const payload = vi.mocked(mockApi.api.db.createInterviewTemplate).mock.calls[0][0]
      expect(payload.blocks?.[0].questions[0]).not.toHaveProperty('guidance')
      expect(payload.blocks?.[0].questions[1]).not.toHaveProperty('guidance')

      const toasts = await screen.findAllByText('Plantilla creada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      await expectBackOnInterviewTemplatesTab()
    })

    // SPEC-012 · AC-14
    it('shows nested "Campo requerido" errors for name, block title and question text without persisting', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/interview-templates/new')

      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findAllByText('Campo requerido')).toHaveLength(3)
      expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Pregunta')).toHaveAttribute('aria-invalid', 'true')
      expect(vi.mocked(mockApi.api.db.createInterviewTemplate)).not.toHaveBeenCalled()
    })

    // SPEC-012 · AC-15
    it('persists phase as null when "Sin fase" (default) is kept', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.createInterviewTemplate).mockResolvedValue({
        ok: true,
        data: { ...EXISTING, id: 'tpl-new', phase: null }
      })
      renderEditor('/settings/interview-templates/new')

      expect(screen.getByRole('combobox', { name: 'Fase' })).toHaveTextContent('Sin fase')
      await user.type(screen.getByLabelText('Nombre'), 'Sin fase asignada')
      await user.type(screen.getByLabelText('Título'), 'Bloque único')
      await user.type(screen.getByLabelText('Pregunta'), '¿Pregunta única?')
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      const payload = vi.mocked(mockApi.api.db.createInterviewTemplate).mock.calls[0][0]
      expect(payload.phase).toBeNull()
      // La ausencia de Badge en la fila del listado se cubre en el test del listado
    })

    // SPEC-012 · AC-16 + SPEC-051 · AC-12 (salida por Volver → pestaña de Ajustes)
    it('guards leaving with unsaved changes via "Descartar cambios" and returns directly to the interview-templates tab when clean', async () => {
      const user = userEvent.setup()

      // Con cambios: AlertDialog y Descartar navega a la pestaña de Ajustes
      const { unmount } = renderEditor('/settings/interview-templates/new')
      await user.type(screen.getByLabelText('Nombre'), 'Cambio sin guardar')
      await user.click(screen.getByRole('button', { name: 'Volver' }))
      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Descartar cambios' })).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Descartar' }))
      await expectBackOnInterviewTemplatesTab()
      expect(vi.mocked(mockApi.api.db.createInterviewTemplate)).not.toHaveBeenCalled()
      unmount()

      // Sin cambios: vuelta directa sin diálogo
      renderEditor('/settings/interview-templates/new')
      await user.click(screen.getByRole('button', { name: 'Volver' }))
      await expectBackOnInterviewTemplatesTab()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    // SPEC-051 · AC-12 (salida por Cancelar del bottom bar → pestaña de Ajustes)
    it('returns to the interview-templates tab when leaving via the "Cancelar" button with no changes', async () => {
      const user = userEvent.setup()
      renderEditor('/settings/interview-templates/new')

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      await expectBackOnInterviewTemplatesTab()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  describe('editing', () => {
    // SPEC-012 · AC-17 (+ SPEC-051 · AC-11: el editor carga la plantilla del :id)
    it('loads name, phase, blocks, guidances and questions in their exact stored order', async () => {
      renderEditor('/settings/interview-templates/tpl-1')

      expect(await screen.findByRole('heading', { name: 'Editar plantilla' })).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.getInterviewTemplate)).toHaveBeenCalledWith('tpl-1')
      expect(await screen.findByLabelText('Nombre')).toHaveValue('Plantilla base')
      expect(screen.getByRole('combobox', { name: 'Fase' })).toHaveTextContent('Problema')
      expect(inputValues('Título')).toEqual(['Bloque A', 'Bloque B'])
      expect(inputValues('Pregunta')).toEqual([
        'Pregunta A1',
        'Pregunta A2',
        'Pregunta B1',
        'Pregunta B2'
      ])
      // Guías: presentes donde existen, '' donde el contrato trae la clave omitida
      expect(
        screen.getAllByLabelText('Guía del bloque').map((el) => (el as HTMLTextAreaElement).value)
      ).toEqual(['Guía A', ''])
      expect(inputValues('Guía de la pregunta')).toEqual(['Guía A1', '', '', ''])
    })
  })
})
