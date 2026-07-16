/**
 * Tests del detalle de discovery. SPEC-010 (AC-15..AC-17) definió el detalle
 * mínimo; SPEC-044 (AC-23) retiró la sección Empresas; SPEC-045 lo rellena:
 * cabecera con botón «Editar» (mismo Dialog de discovery del listado),
 * sección «Objetivos» (texto libre con saltos de línea; muted si no hay) y
 * sección «Grupos de entrevistas» con CRUD completo (Dialog de 4 campos con
 * Selects opcionales sentinel «Sin template», AlertDialog de borrado — las
 * entrevistas se conservan sin grupo — y SET NULL resiliente para templates
 * borrados). Frontera de mocking: api.db del bridge (el detalle resuelve el
 * discovery con listDiscoveries + find; los grupos con listInterviewGroups y
 * los catálogos con listInterviewTemplates/listNoteTemplates).
 * Notas del dev aplicadas: los dialogs de fila se abren con setTimeout(0)
 * desde el menú ⋯ → findBy* + waitFor(toHaveFocus); toasts de sonner
 * renderizados como <li> → findAllByText.
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DiscoveriesPage } from '@/pages/DiscoveriesPage'
import { DiscoveryDetailPage } from '@/pages/DiscoveryDetailPage'
import type { Discovery, InterviewGroup, InterviewTemplate, NoteTemplate } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const DISCOVERY: Discovery = {
  id: 'd-1',
  name: 'Discovery Maurya',
  objectives: null,
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z'
}

const OBJECTIVES_TEXT = 'Entender el problema real\nValidar la urgencia de la solución'

const DISCOVERY_WITH_OBJECTIVES: Discovery = {
  ...DISCOVERY,
  objectives: OBJECTIVES_TEXT
}

const INTERVIEW_TEMPLATE: InterviewTemplate = {
  id: 'it-1',
  name: 'Guía Problema',
  phase: 'problem',
  blocks: [],
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z'
}

const NOTE_TEMPLATE: NoteTemplate = {
  id: 'nt-1',
  name: 'Notas de entrevista',
  context: '',
  sections: [],
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z'
}

function group(
  id: string,
  name: string,
  objective: string | null,
  interviewTemplateId: string | null,
  noteTemplateId: string | null,
  createdAt = '2026-07-10T10:00:00.000Z'
): InterviewGroup {
  return {
    id,
    discoveryId: 'd-1',
    name,
    objective,
    interviewTemplateId,
    noteTemplateId,
    createdAt,
    updatedAt: createdAt
  }
}

const GROUP_FOUNDERS = group(
  'g-1',
  'Founders early-stage',
  'Detectar dolores reales en la validación',
  'it-1',
  'nt-1'
)

function setDiscoveries(discoveries: Discovery[]): void {
  vi.mocked(mockApi.api.db.listDiscoveries).mockResolvedValue({ ok: true, data: discoveries })
}

function setGroups(groups: InterviewGroup[]): void {
  vi.mocked(mockApi.api.db.listInterviewGroups).mockResolvedValue({ ok: true, data: groups })
}

function setTemplateCatalogs(): void {
  vi.mocked(mockApi.api.db.listInterviewTemplates).mockResolvedValue({
    ok: true,
    data: [INTERVIEW_TEMPLATE]
  })
  vi.mocked(mockApi.api.db.listNoteTemplates).mockResolvedValue({
    ok: true,
    data: [NOTE_TEMPLATE]
  })
}

function renderAt(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/discoveries" element={<DiscoveriesPage />} />
          <Route path="/discoveries/:id" element={<DiscoveryDetailPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/** Abre una acción del menú ⋯ de la primera fila de grupo (dialogs con setTimeout(0)). */
async function openGroupRowAction(
  user: ReturnType<typeof userEvent.setup>,
  action: 'Editar' | 'Eliminar'
): Promise<void> {
  await user.click((await screen.findAllByTestId('group-row-actions'))[0])
  await user.click(await screen.findByRole('menuitem', { name: action }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  setDiscoveries([DISCOVERY])
})

describe('DiscoveryDetailPage', () => {
  describe('navigating from the list', () => {
    // SPEC-010 · AC-15 (derogado parcialmente por SPEC-011 AC-02 y después
    // por SPEC-044 · AC-23: la sección Empresas se retira del detalle — la
    // gestión vive en /companies y sus tests en tests/unit/companies)
    it('opens /discoveries/:id from the row name showing the title and WITHOUT the companies section (SPEC-044)', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries')

      await user.click(await screen.findByRole('link', { name: 'Discovery Maurya' }))

      expect(
        await screen.findByRole('heading', { name: 'Discovery Maurya', level: 1 })
      ).toBeInTheDocument()
      // SPEC-044 · AC-23: el detalle ya NO muestra la sección «Empresas»
      expect(screen.queryByRole('heading', { name: 'Empresas' })).not.toBeInTheDocument()
      expect(screen.queryByText('Aún no hay empresas')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Nueva empresa' })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Añadir primera empresa' })
      ).not.toBeInTheDocument()
    })
  })

  describe('invalid id', () => {
    // SPEC-010 · AC-16
    it('shows the error state with the "Volver a Discoveries" link for a nonexistent id', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries/id-que-no-existe')

      expect(await screen.findByText('Discovery no encontrado')).toBeInTheDocument()
      const backLink = screen.getByRole('link', { name: 'Volver a Discoveries' })
      await user.click(backLink)

      // La salida funciona: regresa al listado
      expect(await screen.findByRole('button', { name: 'Nuevo discovery' })).toBeInTheDocument()
    })
  })

  describe('back button', () => {
    // SPEC-010 · AC-17
    it('returns to the list when the "Volver" back button is clicked', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries/d-1')

      await screen.findByRole('heading', { name: 'Discovery Maurya', level: 1 })
      await user.click(screen.getByRole('button', { name: 'Volver' }))

      expect(await screen.findByRole('button', { name: 'Nuevo discovery' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Discovery Maurya' })).toBeInTheDocument()
    })
  })

  describe('objectives section (SPEC-045)', () => {
    // SPEC-045 · AC-05
    it('renders the "Objetivos" section under the h1 with the text as-is preserving line breaks', async () => {
      setDiscoveries([DISCOVERY_WITH_OBJECTIVES])
      renderAt('/discoveries/d-1')

      await screen.findByRole('heading', { name: 'Discovery Maurya', level: 1 })
      expect(screen.getByRole('heading', { name: 'Objetivos', level: 3 })).toBeInTheDocument()
      const objectives = screen.getByTestId('discovery-objectives')
      // Texto tal cual, con el salto de línea intacto (whitespace-pre-wrap)
      expect(objectives.textContent).toBe(OBJECTIVES_TEXT)
      expect(objectives).toHaveClass('whitespace-pre-wrap')
    })

    // SPEC-045 · AC-06
    it('shows the muted "Aún no hay objetivos" message next to the edit button when there are none', async () => {
      setDiscoveries([DISCOVERY])
      renderAt('/discoveries/d-1')

      await screen.findByRole('heading', { name: 'Discovery Maurya', level: 1 })
      const objectives = screen.getByTestId('discovery-objectives')
      expect(objectives).toHaveTextContent('Aún no hay objetivos')
      expect(objectives).toHaveClass('text-muted-foreground')
      // El botón de edición de la cabecera acompaña al mensaje
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    })

    // SPEC-045 · AC-07
    it('opens the preloaded discovery dialog from the header "Editar" and reflects the saved changes with the toast', async () => {
      const user = userEvent.setup()
      setDiscoveries([DISCOVERY_WITH_OBJECTIVES])
      vi.mocked(mockApi.api.db.updateDiscovery).mockResolvedValue({
        ok: true,
        data: {
          ...DISCOVERY_WITH_OBJECTIVES,
          objectives: 'Objetivos revisados tras la primera ronda',
          updatedAt: '2026-07-16T10:00:00.000Z'
        }
      })
      renderAt('/discoveries/d-1')

      await screen.findByRole('heading', { name: 'Discovery Maurya', level: 1 })
      await user.click(screen.getByRole('button', { name: 'Editar' }))

      // Mismo Dialog de discovery (nombre + objetivos) precargado
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Editar discovery' })).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Discovery Maurya')
      const textarea = within(dialog).getByLabelText('Objetivos')
      expect(textarea).toHaveValue(OBJECTIVES_TEXT)

      await user.clear(textarea)
      await user.type(textarea, 'Objetivos revisados tras la primera ronda')
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.updateDiscovery)).toHaveBeenCalledWith('d-1', {
        name: 'Discovery Maurya',
        objectives: 'Objetivos revisados tras la primera ronda'
      })
      const toasts = await screen.findAllByText('Cambios guardados')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByTestId('discovery-objectives')).toHaveTextContent(
        'Objetivos revisados tras la primera ronda'
      )
    })
  })

  describe('interview groups listing (SPEC-045)', () => {
    // SPEC-045 · AC-08
    it('renders each group row with its name, one-line truncated objective and the assigned template names', async () => {
      setTemplateCatalogs()
      setGroups([GROUP_FOUNDERS, group('g-2', 'Compradores B2B', null, null, null)])
      renderAt('/discoveries/d-1')

      const list = await screen.findByTestId('interview-groups-list')
      expect(
        screen.getByRole('heading', { name: 'Grupos de entrevistas', level: 3 })
      ).toBeInTheDocument()

      // Fila con objetivo y ambos templates resueltos por nombre
      expect(within(list).getByText('Founders early-stage')).toBeInTheDocument()
      const objective = within(list).getByText('Detectar dolores reales en la validación')
      expect(objective).toHaveClass('truncate')
      expect(
        within(list).getByText('Guía Problema · Notas de entrevista')
      ).toBeInTheDocument()

      // Fila sin objetivo y sin templates → huecos muted "Sin template …"
      expect(within(list).getByText('Compradores B2B')).toBeInTheDocument()
      const noTemplates = within(list).getByText(
        'Sin template de preguntas · Sin template de notas'
      )
      expect(noTemplates).toHaveClass('text-muted-foreground')
      expect(within(list).getAllByTestId('group-row-actions')).toHaveLength(2)
    })

    // SPEC-045 · AC-15 (SET NULL de SPEC-043: template borrado → hueco sin crash)
    it('shows "Sin template de preguntas" for a group whose template no longer exists without crashing', async () => {
      setTemplateCatalogs()
      setGroups([group('g-3', 'Grupo huérfano', null, 'it-borrado', 'nt-1')])
      renderAt('/discoveries/d-1')

      const list = await screen.findByTestId('interview-groups-list')
      expect(within(list).getByText('Grupo huérfano')).toBeInTheDocument()
      expect(
        within(list).getByText('Sin template de preguntas · Notas de entrevista')
      ).toBeInTheDocument()
    })

    // SPEC-045 · AC-12
    it('shows the empty state with the "Crear primer grupo" button that opens the group dialog', async () => {
      const user = userEvent.setup()
      setGroups([])
      renderAt('/discoveries/d-1')

      expect(await screen.findByText('Aún no hay grupos de entrevistas')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Crear primer grupo' }))

      const dialog = await screen.findByTestId('group-form-dialog')
      expect(within(dialog).getByRole('heading', { name: 'Nuevo grupo' })).toBeInTheDocument()
    })

    // SPEC-045 · AC-16
    it('shows row skeletons in the groups section while they are loading', async () => {
      vi.mocked(mockApi.api.db.listInterviewGroups).mockReturnValue(
        new Promise<never>(() => undefined)
      )
      const { container } = renderAt('/discoveries/d-1')

      // El discovery ya resolvió (h1 visible): los skeletons son de los grupos
      await screen.findByRole('heading', { name: 'Discovery Maurya', level: 1 })
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
      expect(screen.queryByText('Aún no hay grupos de entrevistas')).not.toBeInTheDocument()
    })

    // SPEC-045 · AC-17
    it('shows the muted envelope error message when listing the groups fails', async () => {
      vi.mocked(mockApi.api.db.listInterviewGroups).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'Fallo simulado al listar grupos' }
      })
      renderAt('/discoveries/d-1')

      const message = await screen.findByText('Fallo simulado al listar grupos')
      expect(message).toHaveClass('text-muted-foreground')
      expect(screen.queryByTestId('interview-groups-list')).not.toBeInTheDocument()
    })
  })

  describe('group creation (SPEC-045)', () => {
    // SPEC-045 · AC-09
    it('opens the "Nuevo grupo" dialog with Nombre, Objetivo and both optional template selects defaulting to "Sin template"', async () => {
      const user = userEvent.setup()
      setTemplateCatalogs()
      setGroups([])
      renderAt('/discoveries/d-1')

      await user.click(await screen.findByRole('button', { name: 'Nuevo grupo' }))

      const dialog = await screen.findByTestId('group-form-dialog')
      expect(within(dialog).getByRole('heading', { name: 'Nuevo grupo' })).toBeInTheDocument()
      const nameInput = within(dialog).getByLabelText('Nombre')
      await waitFor(() => expect(nameInput).toHaveFocus())
      expect(within(dialog).getByLabelText('Objetivo')).toBeInTheDocument()

      // Select de template de preguntas: default "Sin template" + opciones con fase
      const interviewSelect = within(dialog).getByRole('combobox', {
        name: 'Template de preguntas'
      })
      expect(interviewSelect).toBe(within(dialog).getByTestId('group-interview-template-select'))
      expect(interviewSelect).toHaveTextContent('Sin template')
      await user.click(interviewSelect)
      expect(await screen.findByRole('option', { name: 'Guía Problema (Problema)' })).toBeVisible()
      await user.click(screen.getByRole('option', { name: 'Sin template' }))

      // Select de template de notas: default "Sin template" + opciones por nombre
      const noteSelect = within(dialog).getByRole('combobox', { name: 'Template de notas' })
      expect(noteSelect).toBe(within(dialog).getByTestId('group-note-template-select'))
      expect(noteSelect).toHaveTextContent('Sin template')
      await user.click(noteSelect)
      expect(await screen.findByRole('option', { name: 'Notas de entrevista' })).toBeVisible()
      await user.click(screen.getByRole('option', { name: 'Sin template' }))
    })

    // SPEC-045 · AC-10
    it('shows the inline "Campo requerido" error when creating a group with an empty name without calling the bridge', async () => {
      const user = userEvent.setup()
      setGroups([])
      renderAt('/discoveries/d-1')

      await user.click(await screen.findByRole('button', { name: 'Nuevo grupo' }))
      const dialog = await screen.findByTestId('group-form-dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Crear' }))

      expect(await within(dialog).findByText('Campo requerido')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.createInterviewGroup)).not.toHaveBeenCalled()
    })

    // SPEC-045 · AC-11
    it('creates the group with the chosen templates, adds it to the list and shows the "Grupo creado" toast', async () => {
      const user = userEvent.setup()
      setTemplateCatalogs()
      setGroups([])
      vi.mocked(mockApi.api.db.createInterviewGroup).mockResolvedValue({
        ok: true,
        data: GROUP_FOUNDERS
      })
      renderAt('/discoveries/d-1')

      await user.click(await screen.findByRole('button', { name: 'Nuevo grupo' }))
      const dialog = await screen.findByTestId('group-form-dialog')
      const nameInput = within(dialog).getByLabelText('Nombre')
      await waitFor(() => expect(nameInput).toHaveFocus())
      await user.type(nameInput, 'Founders early-stage')
      await user.type(
        within(dialog).getByLabelText('Objetivo'),
        'Detectar dolores reales en la validación'
      )
      await user.click(within(dialog).getByRole('combobox', { name: 'Template de preguntas' }))
      await user.click(await screen.findByRole('option', { name: 'Guía Problema (Problema)' }))
      await user.click(within(dialog).getByRole('combobox', { name: 'Template de notas' }))
      await user.click(await screen.findByRole('option', { name: 'Notas de entrevista' }))
      await user.click(within(dialog).getByRole('button', { name: 'Crear' }))

      expect(vi.mocked(mockApi.api.db.createInterviewGroup)).toHaveBeenCalledWith({
        discoveryId: 'd-1',
        name: 'Founders early-stage',
        objective: 'Detectar dolores reales en la validación',
        interviewTemplateId: 'it-1',
        noteTemplateId: 'nt-1'
      })
      const toasts = await screen.findAllByText('Grupo creado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      await waitFor(() => expect(screen.queryByTestId('group-form-dialog')).not.toBeInTheDocument())
      const list = await screen.findByTestId('interview-groups-list')
      expect(within(list).getByText('Founders early-stage')).toBeInTheDocument()
      expect(
        within(list).getByText('Guía Problema · Notas de entrevista')
      ).toBeInTheDocument()
    })
  })

  describe('group editing and deletion (SPEC-045)', () => {
    // SPEC-045 · AC-13
    it('opens the "Editar grupo" dialog preloaded with name, objective and both templates and saves the changes with the toast', async () => {
      const user = userEvent.setup()
      setTemplateCatalogs()
      setGroups([GROUP_FOUNDERS])
      vi.mocked(mockApi.api.db.updateInterviewGroup).mockResolvedValue({
        ok: true,
        data: { ...GROUP_FOUNDERS, name: 'Founders serie A', updatedAt: '2026-07-16T10:00:00.000Z' }
      })
      renderAt('/discoveries/d-1')

      await screen.findByTestId('interview-groups-list')
      await openGroupRowAction(user, 'Editar')

      const dialog = await screen.findByTestId('group-form-dialog')
      expect(within(dialog).getByRole('heading', { name: 'Editar grupo' })).toBeInTheDocument()
      const nameInput = within(dialog).getByLabelText('Nombre')
      await waitFor(() => expect(nameInput).toHaveFocus())
      expect(nameInput).toHaveValue('Founders early-stage')
      expect(within(dialog).getByLabelText('Objetivo')).toHaveValue(
        'Detectar dolores reales en la validación'
      )
      expect(
        within(dialog).getByRole('combobox', { name: 'Template de preguntas' })
      ).toHaveTextContent('Guía Problema (Problema)')
      expect(
        within(dialog).getByRole('combobox', { name: 'Template de notas' })
      ).toHaveTextContent('Notas de entrevista')

      await user.clear(nameInput)
      await user.type(nameInput, 'Founders serie A')
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.updateInterviewGroup)).toHaveBeenCalledWith('g-1', {
        name: 'Founders serie A',
        objective: 'Detectar dolores reales en la validación',
        interviewTemplateId: 'it-1',
        noteTemplateId: 'nt-1'
      })
      const toasts = await screen.findAllByText('Cambios guardados')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      await waitFor(() => expect(screen.queryByTestId('group-form-dialog')).not.toBeInTheDocument())
      const list = screen.getByTestId('interview-groups-list')
      expect(within(list).getByText('Founders serie A')).toBeInTheDocument()
      expect(within(list).queryByText('Founders early-stage')).not.toBeInTheDocument()
    })

    // SPEC-045 · AC-14
    it('confirms the "Eliminar grupo" AlertDialog warning that its interviews are kept and removes the row with the toast', async () => {
      const user = userEvent.setup()
      setTemplateCatalogs()
      setGroups([GROUP_FOUNDERS])
      vi.mocked(mockApi.api.db.deleteInterviewGroup).mockResolvedValue({ ok: true, data: null })
      renderAt('/discoveries/d-1')

      await screen.findByTestId('interview-groups-list')
      await openGroupRowAction(user, 'Eliminar')

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Eliminar grupo' })).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          /Se eliminará «Founders early-stage»\. Sus entrevistas se conservarán sin grupo\./
        )
      ).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

      expect(vi.mocked(mockApi.api.db.deleteInterviewGroup)).toHaveBeenCalledWith('g-1')
      const toasts = await screen.findAllByText('Grupo eliminado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Founders early-stage')).not.toBeInTheDocument()
      // Con cero grupos vuelve el empty state
      expect(await screen.findByText('Aún no hay grupos de entrevistas')).toBeInTheDocument()
    })
  })
})
