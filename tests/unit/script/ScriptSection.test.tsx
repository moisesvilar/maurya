/**
 * Tests de la sección Guión del detalle de entrevista (SPEC-014, mitad UI;
 * lectura/edición adaptadas por SPEC-027 al render markdown enriquecido +
 * editor WYSIWYG, con sus ACs nuevos en el describe "wysiwyg (SPEC-027)").
 * Frontera de mocking: api.llm + api.db. Montado vía InterviewDetailPage con
 * rutas reales (el Badge de estado vive en la cabecera de la página y se
 * actualiza con onInterviewUpdated).
 * Lecciones aplicadas: hay DOS botones "Generar guión" (cabecera + empty) →
 * getAllBy; máx 1 tooltip hover por render; sonner tolerante; sin asserts de
 * foco síncrono innecesarios. jsdom+ProseMirror: los cambios en el editor se
 * hacen vía toolbar (API de TipTap, sin beforeinput nativo); con el documento
 * intacto el editor no emite onChange, así el dirty-check y el round-trip son
 * deterministas.
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
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

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: 'i-1',
    // SPEC-020 (schema v2): toda entrevista ancla su discovery directamente.
    discoveryId: 'd-1',
    companyId: 'c-1',
    contactId: null,
    templateId: 'tpl-1',
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

const WITH_SCRIPT = interview({
  scriptMarkdown: '# Guión adaptado\n\n## Bloque 1\nPregunta adaptada a Acme',
  objectives: ['Objetivo A', 'Objetivo B'],
  status: 'prepared'
})

const GENERATED = interview({
  scriptMarkdown: '# Guión generado\nContenido nuevo',
  objectives: ['Objetivo nuevo'],
  status: 'prepared'
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

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
  setInterview(interview())
  setHasKey(true)
})

describe('ScriptSection', () => {
  describe('generation', () => {
    // SPEC-014 · AC-01 (UI)
    it('shows the loading button while generating and then the script, objectives, "Preparada" badge and toast', async () => {
      const user = userEvent.setup()
      let resolveGeneration!: (value: LlmResult<Interview>) => void
      vi.mocked(mockApi.api.llm.generateScript).mockReturnValue(
        new Promise<LlmResult<Interview>>((resolve) => {
          resolveGeneration = resolve
        })
      )
      renderDetail()

      // Dos botones "Generar guión" (cabecera + empty state). OJO: hasta que
      // llm.getStatus resuelve, solo existe el de cabecera y está DISABLED →
      // esperar al estado habilitado (aparece el CTA del empty) antes de clicar
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: 'Generar guión' })).toHaveLength(2)
      )
      await user.click(screen.getAllByRole('button', { name: 'Generar guión' })[0])

      const loading = await screen.findByRole('button', { name: 'Generando guión…' })
      expect(loading).toBeDisabled()
      expect(vi.mocked(mockApi.api.llm.generateScript)).toHaveBeenCalledWith('i-1')

      resolveGeneration({ ok: true, data: GENERATED })

      // El guión aparece (assert por su contenido: el título coincide con el toast)
      expect(await screen.findByText(/Contenido nuevo/)).toBeInTheDocument()
      expect(screen.getByText('Objetivo nuevo')).toBeInTheDocument()
      expect(screen.getByText('Preparada')).toBeInTheDocument()
      const toasts = await screen.findAllByText('Guión generado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })

    // SPEC-014 · AC-02 (UI)
    it('disables the generate button with the template tooltip when the interview has no template', async () => {
      const user = userEvent.setup()
      setInterview(interview({ templateId: null }))
      renderDetail()

      // Sin template no hay CTA en el empty state: solo el botón de cabecera
      const button = await screen.findByRole('button', { name: 'Generar guión' })
      expect(button).toBeDisabled()

      const wrapper = button.parentElement
      if (wrapper === null) {
        throw new Error('El botón deshabilitado debe estar envuelto por el TooltipTrigger')
      }
      await user.hover(wrapper)
      expect(
        (await screen.findAllByText('Asigna un template para generar el guión')).length
      ).toBeGreaterThanOrEqual(1)
    })

    // SPEC-014 · AC-03 (UI)
    it('shows the key alert linking to Ajustes and disables the button when there is no Anthropic key', async () => {
      setHasKey(false)
      renderDetail()

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(
        'Configura tu clave de Anthropic en Ajustes para generar el guión'
      )
      expect(within(alert).getByRole('link', { name: 'Ajustes' })).toHaveAttribute(
        'href',
        '/settings'
      )
      expect(screen.getByRole('button', { name: 'Generar guión' })).toBeDisabled()
    })

    // SPEC-014 · AC-05
    it('asks for confirmation in the "Regenerar guión" AlertDialog and regenerates on confirm', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      vi.mocked(mockApi.api.llm.generateScript).mockResolvedValue({ ok: true, data: GENERATED })
      renderDetail()

      await user.click(await screen.findByRole('button', { name: 'Regenerar' }))

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Regenerar guión' })).toBeInTheDocument()
      expect(
        within(dialog).getByText('Se sobrescribirán el guión y los objetivos actuales.')
      ).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Regenerar' }))

      expect(vi.mocked(mockApi.api.llm.generateScript)).toHaveBeenCalledWith('i-1')
      const toasts = await screen.findAllByText('Guión generado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })

    // SPEC-014 · AC-06 (UI)
    it('shows an error toast and leaves the interview unchanged when the generation fails', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.llm.generateScript).mockResolvedValue({
        ok: false,
        error: {
          kind: 'auth',
          message: 'La clave de Anthropic no es válida. Revísala en Ajustes.'
        }
      })
      renderDetail()

      // Esperar al estado habilitado (getStatus resuelto) antes de clicar
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: 'Generar guión' })).toHaveLength(2)
      )
      await user.click(screen.getAllByRole('button', { name: 'Generar guión' })[0])

      const toasts = await screen.findAllByText(
        'La clave de Anthropic no es válida. Revísala en Ajustes.'
      )
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // Ni guión ni cambio de estado
      expect(screen.getByText('Aún no hay guión')).toBeInTheDocument()
      expect(screen.getByText('Borrador')).toBeInTheDocument()
      expect(screen.queryByText('Preparada')).not.toBeInTheDocument()
    })
  })

  describe('reading', () => {
    // SPEC-014 · AC-07 (render adaptado por SPEC-027 · AC-10, sin bloque de
    // objetivos por SPEC-025 · AC-03: el modo lectura muestra SOLO el guión y
    // los objetivos viven en la sección superior ObjectivesSection, h3)
    it('renders the script as rich markdown (real headings, no raw syntax) without an objectives block inside Guión', async () => {
      setInterview(WITH_SCRIPT)
      renderDetail()

      const view = await screen.findByTestId('script-markdown-view')
      expect(within(view).getByText('Guión adaptado').closest('h1')).not.toBeNull()
      expect(within(view).getByText('Bloque 1').closest('h2')).not.toBeNull()
      expect(within(view).getByText('Pregunta adaptada a Acme')).toBeInTheDocument()
      // Sin sintaxis markdown en crudo
      expect(view.textContent).not.toContain('#')
      // Sin bloque de objetivos dentro del Guión (SPEC-025); la sección
      // superior los muestra con su propio heading h3
      expect(screen.queryByRole('heading', { name: 'Objetivos', level: 4 })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Objetivos', level: 3 })).toBeInTheDocument()
    })

    // SPEC-014 · AC-08
    it('shows the "Aún no hay guión" empty state with the generate button when prerequisites are met', async () => {
      renderDetail()

      expect(await screen.findByText('Aún no hay guión')).toBeInTheDocument()
      // Cabecera + CTA del empty state, ambos habilitados (el CTA aparece al
      // resolver getStatus: waitFor, no findAll — que resolvería con 1)
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: 'Generar guión' })).toHaveLength(2)
      )
      screen
        .getAllByRole('button', { name: 'Generar guión' })
        .forEach((button) => expect(button).toBeEnabled())
      // El secundario provisional de SPEC-013 está derogado
      expect(
        screen.queryByText('La generación con IA llegará en la siguiente fase')
      ).not.toBeInTheDocument()
    })
  })

  describe('editing', () => {
    // SPEC-014 · AC-09 (editor adaptado por SPEC-027) + SPEC-027 · AC-12 y AC-19
    it('switches to the WYSIWYG editor with rendered content plus editable objectives with add/remove controls', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      renderDetail()

      await user.click(await screen.findByRole('button', { name: 'Editar' }))

      // Editor WYSIWYG con el contenido renderizado (no sintaxis cruda) y editable
      const editor = screen.getByTestId('script-markdown-editor')
      const area = within(editor).getByLabelText('Guión')
      expect(area).toHaveAttribute('contenteditable', 'true')
      expect(within(area).getByText('Guión adaptado').closest('h1')).not.toBeNull()
      expect(within(area).getByText('Bloque 1').closest('h2')).not.toBeNull()
      expect(within(editor).getByRole('toolbar', { name: 'Formato' })).toBeInTheDocument()
      // Los objetivos siguen siendo Inputs de texto plano (SPEC-027 · AC-19)
      expect(screen.getByLabelText('Objetivo 1')).toHaveValue('Objetivo A')
      expect(screen.getByLabelText('Objetivo 2')).toHaveValue('Objetivo B')

      // Añadir → aparece un tercer objetivo vacío
      await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))
      expect(screen.getByLabelText('Objetivo 3')).toHaveValue('')

      // Quitar el primero → quedan dos (B y el vacío)
      await user.click(screen.getAllByRole('button', { name: 'Eliminar objetivo' })[0])
      expect(screen.getByLabelText('Objetivo 1')).toHaveValue('Objetivo B')
      expect(screen.getByLabelText('Objetivo 2')).toHaveValue('')
      expect(screen.queryByLabelText('Objetivo 3')).not.toBeInTheDocument()
    })

    // SPEC-014 · AC-10 + AC-12 (guardado con filtrado de objetivos vacíos, sin
    // status; edición vía toolbar por SPEC-027) + SPEC-027 · AC-14
    it('saves via updateInterview without status, silently dropping empty objectives, and returns to read mode', async () => {
      const user = userEvent.setup()
      const savedMarkdown = '### Guión adaptado\n\n## Bloque 1\n\nPregunta adaptada a Acme'
      setInterview(WITH_SCRIPT)
      vi.mocked(mockApi.api.db.updateInterview).mockResolvedValue({
        ok: true,
        data: {
          ...WITH_SCRIPT,
          scriptMarkdown: savedMarkdown,
          objectives: ['Objetivo A', 'Objetivo B']
        }
      })
      renderDetail()

      await user.click(await screen.findByRole('button', { name: 'Editar' }))
      // Cambio real vía toolbar: el primer bloque (h1) pasa a Encabezado 3
      const editor = screen.getByTestId('script-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      // Un objetivo nuevo que se queda vacío y otro con solo espacios
      await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))
      await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))
      await user.type(screen.getByLabelText('Objetivo 4'), '   ')

      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.updateInterview)).toHaveBeenCalledWith('i-1', {
        scriptMarkdown: savedMarkdown,
        objectives: ['Objetivo A', 'Objetivo B']
      })
      const payload = vi.mocked(mockApi.api.db.updateInterview).mock.calls[0][1]
      expect(payload).not.toHaveProperty('status')

      const toasts = await screen.findAllByText('Cambios guardados')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // Vuelta al modo lectura
      await waitFor(() =>
        expect(screen.queryByTestId('script-markdown-editor')).not.toBeInTheDocument()
      )
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    })

    // SPEC-014 · AC-11 (interacción vía toolbar por SPEC-027) + SPEC-027 · AC-16 y AC-17
    it('asks to discard unsaved changes on cancel, and returns directly when clean', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      renderDetail()

      // Con cambios (toolbar: h1 → Encabezado 2) → AlertDialog "Descartar cambios"
      await user.click(await screen.findByRole('button', { name: 'Editar' }))
      const editor = screen.getByTestId('script-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 2' }))
      await user.click(screen.getByRole('button', { name: 'Cancelar' }))
      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Descartar cambios' })).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Descartar' }))
      await waitFor(() =>
        expect(screen.queryByTestId('script-markdown-editor')).not.toBeInTheDocument()
      )

      // Sin cambios → vuelta directa sin diálogo
      await user.click(screen.getByRole('button', { name: 'Editar' }))
      await user.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.queryByTestId('script-markdown-editor')).not.toBeInTheDocument()
    })
  })

  describe('wysiwyg (SPEC-027)', () => {
    // SPEC-027 · AC-15
    it('persists the exact original markdown when saving without touching the editor (semantic round-trip)', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      vi.mocked(mockApi.api.db.updateInterview).mockResolvedValue({ ok: true, data: WITH_SCRIPT })
      renderDetail()

      await user.click(await screen.findByRole('button', { name: 'Editar' }))
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      // Sin ediciones el borrador es el string persistido: estructura intacta
      expect(vi.mocked(mockApi.api.db.updateInterview)).toHaveBeenCalledWith('i-1', {
        scriptMarkdown: '# Guión adaptado\n\n## Bloque 1\nPregunta adaptada a Acme',
        objectives: ['Objetivo A', 'Objetivo B']
      })
    })

    // SPEC-027 · AC-18
    it('toasts the storage error and stays in edit mode with the change intact when saving fails', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      vi.mocked(mockApi.api.db.updateInterview).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'No se pudo escribir la base de datos' }
      })
      renderDetail()

      await user.click(await screen.findByRole('button', { name: 'Editar' }))
      const editor = screen.getByTestId('script-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      const toasts = await screen.findAllByText('No se pudo escribir la base de datos')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // Sigue en edición y con el cambio aplicado (el h1 pasó a h3)
      const editorStill = screen.getByTestId('script-markdown-editor')
      expect(within(editorStill).getByText('Guión adaptado').closest('h3')).not.toBeNull()
    })

    // SPEC-027 · AC-30
    it('replaces the edited script on confirmed regeneration and renders the new one as rich markdown', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      vi.mocked(mockApi.api.llm.generateScript).mockResolvedValue({ ok: true, data: GENERATED })
      renderDetail()

      await user.click(await screen.findByRole('button', { name: 'Regenerar' }))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Regenerar' }))

      const view = await screen.findByTestId('script-markdown-view')
      await waitFor(() => {
        expect(within(view).getByText('Guión generado').closest('h1')).not.toBeNull()
      })
      expect(within(view).getByText('Contenido nuevo')).toBeInTheDocument()
      expect(within(view).queryByText('Guión adaptado')).not.toBeInTheDocument()
    })
  })
})
