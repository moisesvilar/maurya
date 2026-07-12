/**
 * Tests de la sección Entrevistas del detalle de empresa (SPEC-013,
 * AC-01..AC-10 y AC-14). Frontera de mocking: api.db.
 * Lecciones aplicadas: la página tiene DOS grupos de menús "Acciones"
 * (contactos y entrevistas) y DOS AlertDialogs → matching por fila (closest li
 * del título), nunca por índice global; menú→dialog con findBy* (setTimeout(0))
 * y sin asserts de selección/foco síncrono; toasts de sonner son <li> (no
 * contar listitems globales); fondo aria-hidden con dialog abierto.
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { InterviewDetailPage } from '@/pages/InterviewDetailPage'
import type { Company, Contact, Interview, InterviewTemplate } from '@/types/domain'
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

const CONTACT: Contact = {
  id: 'ct-1',
  companyId: 'c-1',
  name: 'Jane Doe',
  position: null,
  linkedinUrl: null,
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z'
}

const TEMPLATE: InterviewTemplate = {
  id: 'tpl-1',
  name: 'Entrevista MDR',
  phase: 'problem',
  blocks: [{ title: 'Contexto', questions: [{ text: '¿Quién lleva el regulatorio?' }] }],
  createdAt: '2026-07-04T09:00:00.000Z',
  updatedAt: '2026-07-04T09:00:00.000Z'
}

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: 'i-1',
    // SPEC-020 (schema v2): toda entrevista ancla su discovery directamente.
    discoveryId: 'd-1',
    companyId: 'c-1',
    contactId: 'ct-1',
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

function setInterviews(interviews: Interview[]): void {
  vi.mocked(mockApi.api.db.listInterviews).mockResolvedValue({ ok: true, data: interviews })
}

function setContacts(contacts: Contact[]): void {
  vi.mocked(mockApi.api.db.listContacts).mockResolvedValue({ ok: true, data: contacts })
}

function setTemplates(templates: InterviewTemplate[]): void {
  vi.mocked(mockApi.api.db.listInterviewTemplates).mockResolvedValue({
    ok: true,
    data: templates
  })
}

function renderCompany(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/discoveries/d-1/companies/c-1']}>
        <Routes>
          <Route
            path="/discoveries/:discoveryId/companies/:companyId"
            element={<CompanyDetailPage />}
          />
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

/** Fila de una entrevista, acotada por su título (hay Acciones también en Contactos). */
async function findInterviewRow(title: string): Promise<HTMLElement> {
  const link = await screen.findByRole('link', { name: title })
  const row = link.closest('li')
  if (row === null) {
    throw new Error('La entrevista debe renderizarse en una fila de lista propia')
  }
  return row
}

/** Abre el dialog de creación de entrevista y devuelve el input Título. */
async function openCreateDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'Nueva entrevista' }))
  await screen.findByRole('dialog')
  return screen.getByLabelText('Título')
}

/** Abre una acción del menú ⋯ de la fila de una entrevista (dialogs con setTimeout(0)). */
async function openRowAction(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
  action: 'Editar' | 'Eliminar'
): Promise<void> {
  const row = await findInterviewRow(title)
  await user.click(within(row).getByRole('button', { name: 'Acciones' }))
  await user.click(await screen.findByRole('menuitem', { name: action }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
  setInterviews([])
  setContacts([])
  setTemplates([])
})

describe('CompanyDetailPage (entrevistas)', () => {
  describe('listing', () => {
    // SPEC-013 · AC-01
    it('renders each interview row with title link, "Borrador" badge, resolved refs and its own actions menu', async () => {
      setInterviews([interview()])
      setContacts([CONTACT])
      setTemplates([TEMPLATE])
      const user = userEvent.setup()
      renderCompany()

      const row = await findInterviewRow('Discovery con Acme')
      expect(within(row).getByRole('link', { name: 'Discovery con Acme' })).toHaveAttribute(
        'href',
        '/discoveries/d-1/companies/c-1/interviews/i-1'
      )
      expect(within(row).getByText('Borrador')).toBeInTheDocument()
      expect(within(row).getByText('Jane Doe · Entrevista MDR')).toBeInTheDocument()

      await user.click(within(row).getByRole('button', { name: 'Acciones' }))
      expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toBeInTheDocument()
    })

    // SPEC-013 · AC-02
    it('shows the empty state with the "Crear primera entrevista" CTA when there are none', async () => {
      renderCompany()

      expect(await screen.findByText('Aún no hay entrevistas')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear primera entrevista' })).toBeInTheDocument()
    })

    // SPEC-013 · AC-03
    it('shows skeletons in the interviews section while the list is loading', async () => {
      vi.mocked(mockApi.api.db.listInterviews).mockReturnValue(new Promise<never>(() => undefined))
      const { container } = renderCompany()

      await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      await screen.findByText('Aún no hay contactos')
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
      expect(screen.queryByText('Aún no hay entrevistas')).not.toBeInTheDocument()
    })
  })

  describe('creating an interview', () => {
    // SPEC-013 · AC-04
    it('opens the "Nueva entrevista" dialog with focused title and the optional contact/template selects', async () => {
      setContacts([CONTACT])
      setTemplates([TEMPLATE])
      const user = userEvent.setup()
      renderCompany()

      const titleInput = await openCreateDialog(user)

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Nueva entrevista' })).toBeInTheDocument()
      expect(titleInput).toHaveAttribute('placeholder', 'Discovery con Acme Corp')
      expect(document.activeElement).toBe(titleInput)

      // Select de contacto: "Sin contacto" + contactos de la empresa
      expect(screen.getByRole('combobox', { name: 'Contacto' })).toHaveTextContent('Sin contacto')
      await user.click(screen.getByRole('combobox', { name: 'Contacto' }))
      expect(await screen.findByRole('option', { name: 'Sin contacto' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Jane Doe' })).toBeInTheDocument()
      await user.keyboard('{Escape}')

      // Select de template: "Sin template" + templates con su fase entre paréntesis
      expect(screen.getByRole('combobox', { name: 'Template' })).toHaveTextContent('Sin template')
      await user.click(screen.getByRole('combobox', { name: 'Template' }))
      expect(await screen.findByRole('option', { name: 'Sin template' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Entrevista MDR (Problema)' })).toBeInTheDocument()
    })

    // SPEC-013 · AC-05 (envío con click en "Crear" y referencias elegidas)
    it('creates in draft with the chosen refs on "Crear" click, shows the toast and lists the row', async () => {
      setContacts([CONTACT])
      setTemplates([TEMPLATE])
      vi.mocked(mockApi.api.db.createInterview).mockResolvedValue({
        ok: true,
        data: interview({ title: 'Entrevista con Jane' })
      })
      const user = userEvent.setup()
      renderCompany()

      const titleInput = await openCreateDialog(user)
      await user.type(titleInput, 'Entrevista con Jane')
      await user.click(screen.getByRole('combobox', { name: 'Contacto' }))
      await user.click(await screen.findByRole('option', { name: 'Jane Doe' }))
      await user.click(screen.getByRole('combobox', { name: 'Template' }))
      await user.click(await screen.findByRole('option', { name: 'Entrevista MDR (Problema)' }))
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      // SPEC-020: la creación viaja con el discoveryId de la ruta (schema v2)
      expect(vi.mocked(mockApi.api.db.createInterview)).toHaveBeenCalledWith({
        discoveryId: 'd-1',
        companyId: 'c-1',
        title: 'Entrevista con Jane',
        contactId: 'ct-1',
        templateId: 'tpl-1'
      })
      const toasts = await screen.findAllByText('Entrevista creada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByRole('link', { name: 'Entrevista con Jane' })).toBeInTheDocument()
    })

    // SPEC-013 · AC-05 (envío con Enter y sentinels → null sin tocar los Selects)
    it('creates on Enter mapping the untouched selects to null refs', async () => {
      vi.mocked(mockApi.api.db.createInterview).mockResolvedValue({
        ok: true,
        data: interview({ title: 'Sin referencias', contactId: null, templateId: null })
      })
      const user = userEvent.setup()
      renderCompany()

      const titleInput = await openCreateDialog(user)
      await user.type(titleInput, 'Sin referencias{Enter}')

      expect(vi.mocked(mockApi.api.db.createInterview)).toHaveBeenCalledWith({
        discoveryId: 'd-1',
        companyId: 'c-1',
        title: 'Sin referencias',
        contactId: null,
        templateId: null
      })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    // SPEC-033 · AC-09: la autogeneración del guión es exclusiva del flujo de
    // capturas — crear una entrevista desde la empresa NO dispara
    // llm.autoGenerateScript (comportamiento SPEC-013 intacto, incluso con
    // template asignado)
    it('does not fire the script auto-generation when creating an interview from the company flow (SPEC-033)', async () => {
      setContacts([CONTACT])
      setTemplates([TEMPLATE])
      vi.mocked(mockApi.api.db.createInterview).mockResolvedValue({
        ok: true,
        data: interview({ title: 'Entrevista con Jane' })
      })
      const user = userEvent.setup()
      renderCompany()

      const titleInput = await openCreateDialog(user)
      await user.type(titleInput, 'Entrevista con Jane')
      await user.click(screen.getByRole('combobox', { name: 'Template' }))
      await user.click(await screen.findByRole('option', { name: 'Entrevista MDR (Problema)' }))
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      await waitFor(() => expect(vi.mocked(mockApi.api.db.createInterview)).toHaveBeenCalled())
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(vi.mocked(mockApi.api.llm.autoGenerateScript)).not.toHaveBeenCalled()
    })

    // SPEC-013 · AC-06
    it('shows the inline "Campo requerido" error for an empty title without calling the bridge', async () => {
      const user = userEvent.setup()
      renderCompany()

      await openCreateDialog(user)
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.createInterview)).not.toHaveBeenCalled()
    })

    // SPEC-013 · AC-07
    it('offers only the sentinels when there are no contacts nor templates, and creation still works', async () => {
      vi.mocked(mockApi.api.db.createInterview).mockResolvedValue({
        ok: true,
        data: interview({ title: 'Solo título', contactId: null, templateId: null })
      })
      const user = userEvent.setup()
      renderCompany()

      const titleInput = await openCreateDialog(user)

      await user.click(screen.getByRole('combobox', { name: 'Contacto' }))
      expect(await screen.findAllByRole('option')).toHaveLength(1)
      expect(screen.getByRole('option', { name: 'Sin contacto' })).toBeInTheDocument()
      await user.keyboard('{Escape}')

      await user.click(screen.getByRole('combobox', { name: 'Template' }))
      expect(await screen.findAllByRole('option')).toHaveLength(1)
      expect(screen.getByRole('option', { name: 'Sin template' })).toBeInTheDocument()
      await user.keyboard('{Escape}')

      await user.type(titleInput, 'Solo título')
      await user.click(screen.getByRole('button', { name: 'Crear' }))
      expect(vi.mocked(mockApi.api.db.createInterview)).toHaveBeenCalledWith({
        discoveryId: 'd-1',
        companyId: 'c-1',
        title: 'Solo título',
        contactId: null,
        templateId: null
      })
    })
  })

  describe('editing an interview', () => {
    // SPEC-013 · AC-08
    it('opens the edit dialog preloaded, saves the three fields via updateInterview and shows "Cambios guardados"', async () => {
      setInterviews([interview()])
      setContacts([CONTACT])
      setTemplates([TEMPLATE])
      vi.mocked(mockApi.api.db.updateInterview).mockResolvedValue({
        ok: true,
        data: interview({ title: 'Título editado' })
      })
      const user = userEvent.setup()
      renderCompany()

      await openRowAction(user, 'Discovery con Acme', 'Editar')

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Editar entrevista' })).toBeInTheDocument()
      const titleInput = screen.getByLabelText('Título')
      expect(titleInput).toHaveValue('Discovery con Acme')
      expect(screen.getByRole('combobox', { name: 'Contacto' })).toHaveTextContent('Jane Doe')
      expect(screen.getByRole('combobox', { name: 'Template' })).toHaveTextContent(
        'Entrevista MDR (Problema)'
      )

      await user.clear(titleInput)
      await user.type(titleInput, 'Título editado')
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.updateInterview)).toHaveBeenCalledWith('i-1', {
        title: 'Título editado',
        contactId: 'ct-1',
        templateId: 'tpl-1'
      })
      const toasts = await screen.findAllByText('Cambios guardados')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByRole('link', { name: 'Título editado' })).toBeInTheDocument()
    })

    // SPEC-013 · AC-09
    it('shows the inline "Campo requerido" error when editing to an empty title without calling the bridge', async () => {
      setInterviews([interview()])
      const user = userEvent.setup()
      renderCompany()

      await openRowAction(user, 'Discovery con Acme', 'Editar')
      const titleInput = await screen.findByLabelText('Título')
      await user.clear(titleInput)
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.updateInterview)).not.toHaveBeenCalled()
    })
  })

  describe('deleting an interview', () => {
    // SPEC-013 · AC-10
    it('confirms in the "Eliminar entrevista" AlertDialog with the notes warning and deletes with its toast', async () => {
      setInterviews([interview()])
      vi.mocked(mockApi.api.db.deleteInterview).mockResolvedValue({ ok: true, data: null })
      const user = userEvent.setup()
      renderCompany()

      await openRowAction(user, 'Discovery con Acme', 'Eliminar')

      const dialog = await screen.findByRole('alertdialog')
      expect(
        within(dialog).getByRole('heading', { name: 'Eliminar entrevista' })
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(/Se eliminarán permanentemente «Discovery con Acme» y sus notas\./)
      ).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

      expect(vi.mocked(mockApi.api.db.deleteInterview)).toHaveBeenCalledWith('i-1')
      const toasts = await screen.findAllByText('Entrevista eliminada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByRole('link', { name: 'Discovery con Acme' })).not.toBeInTheDocument()
    })
  })

  describe('mutation errors', () => {
    // SPEC-013 · AC-14
    it('shows an error toast, keeps the dialog open and leaves the list untouched when the bridge fails', async () => {
      vi.mocked(mockApi.api.db.createInterview).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'Fallo simulado al crear entrevista' }
      })
      const user = userEvent.setup()
      renderCompany()

      const titleInput = await openCreateDialog(user)
      await user.type(titleInput, 'Entrevista fallida')
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      const toasts = await screen.findAllByText('Fallo simulado al crear entrevista')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // El Dialog sigue abierto y la lista sigue vacía (fondo aria-hidden)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Aún no hay entrevistas')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Entrevista fallida', hidden: true })).toBeNull()
    })
  })
})
