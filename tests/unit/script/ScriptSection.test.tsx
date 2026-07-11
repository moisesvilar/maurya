/**
 * Tests de la sección Guión del detalle de entrevista (SPEC-014, mitad UI;
 * adaptados por SPEC-027 al editor WYSIWYG y por SPEC-029 a la edición
 * markdown por defecto: con guión, el editor y la lista editable de objetivos
 * están SIEMPRE montados — sin modo lectura ni botón "Editar" — y la barra
 * Guardar/Descartar solo existe con cambios; ACs propios de SPEC-029 en el
 * describe "always-on editing (SPEC-029)").
 * Frontera de mocking: api.llm + api.db. Montado vía InterviewDetailPage con
 * rutas reales (el Badge de estado vive en la cabecera de la página y se
 * actualiza con onInterviewUpdated).
 * Lecciones aplicadas: hay DOS botones "Generar guión" (cabecera + empty) →
 * getAllBy; máx 1 tooltip hover por render; sonner tolerante; sin asserts de
 * foco síncrono innecesarios. jsdom+ProseMirror: los cambios en el editor se
 * hacen vía toolbar (API de TipTap, sin beforeinput nativo); con el documento
 * intacto el editor no emite onChange, así el dirty-check y el round-trip son
 * deterministas. OJO (SPEC-029): el "Regenerar" deshabilitado va envuelto en
 * TooltipTrigger y se REMONTA al habilitarse (getStatus async) → esperar
 * toBeEnabled() por testid y re-consultar antes de clicar (nunca la
 * referencia stale).
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

    // SPEC-014 · AC-05 (adaptado por SPEC-029: el "Regenerar" deshabilitado va
    // envuelto en tooltip y se remonta al habilitarse → esperar y re-consultar)
    it('asks for confirmation in the "Regenerar guión" AlertDialog and regenerates on confirm', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      vi.mocked(mockApi.api.llm.generateScript).mockResolvedValue({ ok: true, data: GENERATED })
      renderDetail()

      await waitFor(() => expect(screen.getByTestId('script-regenerate-button')).toBeEnabled())
      await user.click(screen.getByTestId('script-regenerate-button'))

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
    // SPEC-014 · AC-07 (adaptado por SPEC-027 · AC-10 al render enriquecido y
    // por SPEC-029 al editor siempre montado: el guión se muestra en el
    // MarkdownEditor y el bloque de edición de objetivos —h4— vive siempre
    // debajo; la sección superior ObjectivesSection —h3, SPEC-025— sigue
    // siendo la vista de estado)
    it('renders the script as rich markdown (real headings, no raw syntax) in the always-mounted editor with the objectives edit block below', async () => {
      setInterview(WITH_SCRIPT)
      renderDetail()

      const editor = await screen.findByTestId('script-markdown-editor')
      const area = within(editor).getByLabelText('Guión')
      expect(within(area).getByText('Guión adaptado').closest('h1')).not.toBeNull()
      expect(within(area).getByText('Bloque 1').closest('h2')).not.toBeNull()
      expect(within(area).getByText('Pregunta adaptada a Acme')).toBeInTheDocument()
      // Sin sintaxis markdown en crudo
      expect(area.textContent).not.toContain('#')
      // Bloque de edición de objetivos dentro del Guión (h4, SPEC-029) y
      // sección superior de estado con su propio heading h3 (SPEC-025 intacto)
      expect(screen.getByRole('heading', { name: 'Objetivos', level: 4 })).toBeInTheDocument()
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

  describe('always-on editing (SPEC-029)', () => {
    // SPEC-029 · AC-09 (deroga SPEC-014 · AC-09 y SPEC-027 · AC-12/AC-19 en su
    // disparador: editor y lista de objetivos siempre activos, sin "Editar")
    it('shows the always-mounted WYSIWYG editor and the editable objectives with add/remove controls, without an Editar button', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      renderDetail()

      // Editor WYSIWYG montado directamente, con contenido renderizado y editable
      const editor = await screen.findByTestId('script-markdown-editor')
      const area = within(editor).getByLabelText('Guión')
      expect(area).toHaveAttribute('contenteditable', 'true')
      expect(within(area).getByText('Guión adaptado').closest('h1')).not.toBeNull()
      expect(within(area).getByText('Bloque 1').closest('h2')).not.toBeNull()
      expect(within(editor).getByRole('toolbar', { name: 'Formato' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
      // Los objetivos son Inputs de texto plano (estructura SPEC-014 intacta)
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

    // SPEC-029 · AC-10 (dirty combinado: texto del guión y objetivos —texto,
    // alta y baja—; la barra desaparece si la lista vuelve a igualar la
    // persistida, mismo criterio de comparación que el editor)
    it('shows the Guardar/Descartar bar when the script or any objective changes and hides it when the draft matches the persisted values', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      renderDetail()

      await screen.findByTestId('script-markdown-editor')
      expect(screen.queryByTestId('script-editor-actions')).not.toBeInTheDocument()

      // Alta de objetivo → barra visible con Guardar y Descartar
      await user.click(screen.getByRole('button', { name: 'Añadir objetivo' }))
      const actions = await screen.findByTestId('script-editor-actions')
      expect(within(actions).getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
      expect(within(actions).getByRole('button', { name: 'Descartar' })).toBeInTheDocument()

      // Texto de un objetivo → sigue sucia
      await user.type(screen.getByLabelText('Objetivo 3'), 'Objetivo C')
      expect(screen.getByTestId('script-editor-actions')).toBeInTheDocument()

      // Baja del añadido → la lista iguala la persistida y la barra desaparece
      await user.click(screen.getAllByRole('button', { name: 'Eliminar objetivo' })[2])
      await waitFor(() =>
        expect(screen.queryByTestId('script-editor-actions')).not.toBeInTheDocument()
      )

      // Cambio del texto del guión → la barra reaparece
      const editor = screen.getByTestId('script-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      expect(await screen.findByTestId('script-editor-actions')).toBeInTheDocument()
    })

    // SPEC-029 · AC-11 (+ SPEC-014 · AC-10/AC-12 y SPEC-027 · AC-14 adaptados:
    // sin vuelta a modo lectura — el editor sigue montado y la barra se va)
    it('saves script and objectives via updateInterview without status, silently dropping empty objectives, and hides the bar keeping the editor', async () => {
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

      // Cambio real vía toolbar: el primer bloque (h1) pasa a Encabezado 3
      const editor = await screen.findByTestId('script-markdown-editor')
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
      // La barra desaparece; el editor sigue montado con el contenido guardado
      await waitFor(() =>
        expect(screen.queryByTestId('script-editor-actions')).not.toBeInTheDocument()
      )
      const editorStill = screen.getByTestId('script-markdown-editor')
      expect(within(editorStill).getByText('Guión adaptado').closest('h3')).not.toBeNull()
      // Los objetivos vacíos descartados desaparecen de la lista editable
      expect(screen.queryByLabelText('Objetivo 3')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    })

    // SPEC-029 · AC-12 (+ SPEC-014 · AC-11 y SPEC-027 · AC-16 adaptados:
    // "Cancelar"→"Descartar" y siempre con AlertDialog; el caso "sin cambios,
    // sin diálogo" queda derogado por construcción — sin cambios no hay botón)
    it('opens the "Descartar cambios" AlertDialog on Descartar and restores editor and objectives to the persisted values on confirm', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      renderDetail()

      // Cambios en guión (toolbar: h1 → Encabezado 2) y en un objetivo
      const editor = await screen.findByTestId('script-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 2' }))
      await user.type(screen.getByLabelText('Objetivo 1'), ' bis')

      const actions = await screen.findByTestId('script-editor-actions')
      await user.click(within(actions).getByRole('button', { name: 'Descartar' }))
      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Descartar cambios' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Descartar' }))

      // La barra desaparece y editor + objetivos restauran lo persistido
      await waitFor(() =>
        expect(screen.queryByTestId('script-editor-actions')).not.toBeInTheDocument()
      )
      const editorAfter = screen.getByTestId('script-markdown-editor')
      expect(within(editorAfter).getByText('Guión adaptado').closest('h1')).not.toBeNull()
      expect(screen.getByLabelText('Objetivo 1')).toHaveValue('Objetivo A')
      expect(vi.mocked(mockApi.api.db.updateInterview)).not.toHaveBeenCalled()
    })

    // SPEC-029 · AC-13 (+ SPEC-027 · AC-18 adaptado)
    it('toasts the storage error and keeps the changes with the bar visible when saving fails', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      vi.mocked(mockApi.api.db.updateInterview).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'No se pudo escribir la base de datos' }
      })
      renderDetail()

      const editor = await screen.findByTestId('script-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await user.click(await screen.findByRole('button', { name: 'Guardar' }))

      const toasts = await screen.findAllByText('No se pudo escribir la base de datos')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // El editor conserva el cambio (el h1 pasó a h3) y la barra sigue
      const editorStill = screen.getByTestId('script-markdown-editor')
      expect(within(editorStill).getByText('Guión adaptado').closest('h3')).not.toBeNull()
      expect(screen.getByTestId('script-editor-actions')).toBeInTheDocument()
    })

    // SPEC-029 · AC-14 (botón "Regenerar" unificado con el de la Nota: outline
    // + RefreshCw, siempre visible, deshabilitado con Tooltip explicativo si
    // faltan prerrequisitos — Tooltip nuevo en el Guión por esta spec)
    it('shows the always-visible unified outline "Regenerar" header button, disabled with an explanatory tooltip when the template is missing', async () => {
      const user = userEvent.setup()
      setInterview(
        interview({
          scriptMarkdown: '# Guión adaptado\n\n## Bloque 1\nPregunta adaptada a Acme',
          objectives: ['Objetivo A', 'Objetivo B'],
          status: 'prepared',
          templateId: null
        })
      )
      renderDetail()

      const regenerate = await screen.findByTestId('script-regenerate-button')
      expect(regenerate).toHaveTextContent('Regenerar')
      expect(regenerate).toHaveAttribute('data-variant', 'outline')
      expect(regenerate.querySelector('svg.lucide-refresh-cw')).not.toBeNull()
      expect(regenerate).toBeDisabled()

      // Tooltip explicativo sobre el wrapper del botón deshabilitado
      const wrapper = regenerate.parentElement
      if (wrapper === null) {
        throw new Error('El botón deshabilitado debe estar envuelto por el TooltipTrigger')
      }
      await user.hover(wrapper)
      expect(
        (await screen.findAllByText('Asigna un template para generar el guión')).length
      ).toBeGreaterThanOrEqual(1)
    })

    // SPEC-029 · AC-15 (mitad Guión→página: la sección "Objetivos" superior
    // refleja la lista guardada sin recargar; la otra mitad —render de la
    // sección de estado— vive en ObjectivesSection.test.tsx, SPEC-025 · AC-04)
    it('updates the upper Objetivos section with the saved list after editing objectives from the Guión section', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      vi.mocked(mockApi.api.db.updateInterview).mockResolvedValue({
        ok: true,
        data: { ...WITH_SCRIPT, objectives: ['Objetivo A revisado', 'Objetivo B'] }
      })
      renderDetail()

      await screen.findByTestId('script-markdown-editor')
      await user.type(screen.getByLabelText('Objetivo 1'), ' revisado')
      await user.click(await screen.findByRole('button', { name: 'Guardar' }))

      // La sección de estado superior (SPEC-025) muestra la lista actualizada
      await waitFor(() => {
        const items = screen.getAllByTestId('objective-item')
        expect(items.map((item) => item.textContent)).toEqual(['Objetivo A revisado', 'Objetivo B'])
      })
    })
  })

  describe('wysiwyg (SPEC-027)', () => {
    // SPEC-027 · AC-15 DEROGADO por construcción (SPEC-029): sin tocar el
    // editor no hay botón "Guardar". La intención (round-trip sin
    // normalización espuria) queda cubierta por SPEC-029 · AC-10 (sin
    // ediciones reales la barra no existe y reaparece/desaparece por
    // comparación con lo persistido).

    // SPEC-027 · AC-18: absorbido por SPEC-029 · AC-13 en el describe
    // "always-on editing (SPEC-029)" (mismo escenario, sin paso por "Editar").

    // SPEC-027 · AC-30 (desenlace adaptado por SPEC-029: el guión regenerado
    // se muestra en el editor remontado, no en un modo lectura; se regenera
    // con cambios sin guardar y la barra desaparece)
    it('replaces the edited script on confirmed regeneration showing the new one in the editor and clearing the bar', async () => {
      const user = userEvent.setup()
      setInterview(WITH_SCRIPT)
      vi.mocked(mockApi.api.llm.generateScript).mockResolvedValue({ ok: true, data: GENERATED })
      renderDetail()

      // Guión con cambios sin guardar
      const editor = await screen.findByTestId('script-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await screen.findByTestId('script-editor-actions')

      await waitFor(() => expect(screen.getByTestId('script-regenerate-button')).toBeEnabled())
      await user.click(screen.getByTestId('script-regenerate-button'))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Regenerar' }))

      // El editor remontado muestra el guión nuevo como markdown enriquecido
      await waitFor(() => {
        const editorAfter = screen.getByTestId('script-markdown-editor')
        expect(within(editorAfter).getByText('Guión generado').closest('h1')).not.toBeNull()
      })
      const editorAfter = screen.getByTestId('script-markdown-editor')
      expect(within(editorAfter).getByText('Contenido nuevo')).toBeInTheDocument()
      expect(within(editorAfter).queryByText('Guión adaptado')).not.toBeInTheDocument()
      await waitFor(() =>
        expect(screen.queryByTestId('script-editor-actions')).not.toBeInTheDocument()
      )
    })
  })
})
