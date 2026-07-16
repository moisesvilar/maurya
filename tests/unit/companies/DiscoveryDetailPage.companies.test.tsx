/**
 * Tests de la sección Empresas del detalle de discovery (SPEC-011,
 * AC-01/AC-03..AC-08 + AC-19/AC-20; AC-02 se cubre con el test adaptado de
 * SPEC-010 AC-15 en tests/unit/discoveries — no se duplica). Frontera de
 * mocking: api.db. Rutas reales en MemoryRouter.
 * Lecciones aplicadas: dialogs del menú abren con setTimeout(0) → findBy*;
 * con un dialog modal abierto Radix marca el fondo aria-hidden → texto plano
 * o roles con hidden:true.
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { DiscoveryDetailPage } from '@/pages/DiscoveryDetailPage'
import type { Company, Discovery } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const DISCOVERY: Discovery = {
  id: 'd-1',
  name: 'Discovery Maurya',
  objectives: null,
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z'
}

// SPEC-043: las empresas son globales (sin discoveryId)
function company(overrides: Partial<Company> = {}): Company {
  return {
    id: 'c-1',
    name: 'Acme Corp',
    website: 'https://acme.example',
    linkedinUrl: 'https://linkedin.com/company/acme',
    createdAt: '2026-07-02T12:00:00.000Z',
    updatedAt: '2026-07-02T12:00:00.000Z',
    ...overrides
  }
}

function setCompanies(companies: Company[]): void {
  vi.mocked(mockApi.api.db.listCompanies).mockResolvedValue({ ok: true, data: companies })
}

function renderAt(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/discoveries/:id" element={<DiscoveryDetailPage />} />
          <Route
            path="/discoveries/:discoveryId/companies/:companyId"
            element={<CompanyDetailPage />}
          />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/** Abre el dialog de creación de empresa y devuelve el input Nombre. */
async function openCreateDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'Nueva empresa' }))
  await screen.findByRole('dialog')
  return screen.getByLabelText('Nombre')
}

/** Abre una acción del menú ⋯ de la primera fila (dialogs con setTimeout(0)). */
async function openRowAction(
  user: ReturnType<typeof userEvent.setup>,
  action: 'Editar' | 'Eliminar'
): Promise<void> {
  await user.click((await screen.findAllByRole('button', { name: 'Acciones' }))[0])
  await user.click(await screen.findByRole('menuitem', { name: action }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.listDiscoveries).mockResolvedValue({ ok: true, data: [DISCOVERY] })
  setCompanies([])
})

describe('DiscoveryDetailPage (empresas)', () => {
  describe('company rows', () => {
    // SPEC-011 · AC-01
    it('renders each company row with the name link, conditional external icons and the actions menu', async () => {
      // Con website pero SIN LinkedIn → solo el icono "Abrir website"
      setCompanies([company({ linkedinUrl: null })])
      renderAt('/discoveries/d-1')

      const nameLink = await screen.findByRole('link', { name: 'Acme Corp' })
      expect(nameLink).toHaveAttribute('href', '/discoveries/d-1/companies/c-1')
      expect(screen.getByRole('link', { name: 'Abrir website' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Abrir LinkedIn' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Acciones' })).toBeInTheDocument()
    })
  })

  describe('creating a company', () => {
    // SPEC-011 · AC-03
    it('opens the "Nueva empresa" dialog with focus on Nombre and the optional URL fields', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries/d-1')

      const nameInput = await openCreateDialog(user)

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Nueva empresa' })).toBeInTheDocument()
      expect(document.activeElement).toBe(nameInput)
      expect(screen.getByLabelText('Website')).toHaveAttribute('placeholder', 'https://empresa.com')
      expect(screen.getByLabelText('LinkedIn')).toHaveAttribute(
        'placeholder',
        'https://linkedin.com/company/...'
      )
    })

    // SPEC-011 · AC-04
    it('creates via createCompany normalizing empty optionals to null, shows the toast and lists the row', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.createCompany).mockResolvedValue({
        ok: true,
        data: company({ linkedinUrl: null })
      })
      renderAt('/discoveries/d-1')

      const nameInput = await openCreateDialog(user)
      await user.type(nameInput, 'Acme Corp')
      // Con espacios alrededor: se persiste recortado; LinkedIn vacío → null
      await user.type(screen.getByLabelText('Website'), 'https://acme.example  ')
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      // SPEC-043: el alta crea una empresa GLOBAL — sin discoveryId en el input
      expect(vi.mocked(mockApi.api.db.createCompany)).toHaveBeenCalledWith({
        name: 'Acme Corp',
        website: 'https://acme.example',
        linkedinUrl: null,
        context: null
      })
      const toasts = await screen.findAllByText('Empresa creada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByRole('link', { name: 'Acme Corp' })).toBeInTheDocument()
    })

    // SPEC-011 · AC-05
    it('shows the inline "Campo requerido" error for an empty name without calling the bridge', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries/d-1')

      await openCreateDialog(user)
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.createCompany)).not.toHaveBeenCalled()
    })
  })

  describe('editing a company', () => {
    // SPEC-011 · AC-06
    it('opens the edit dialog preloaded (null → empty), saves via updateCompany and shows "Cambios guardados"', async () => {
      const user = userEvent.setup()
      setCompanies([company({ website: null })])
      vi.mocked(mockApi.api.db.updateCompany).mockResolvedValue({
        ok: true,
        data: company({ name: 'Acme Corporation' })
      })
      renderAt('/discoveries/d-1')

      await screen.findByRole('link', { name: 'Acme Corp' })
      await openRowAction(user, 'Editar')

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Editar empresa' })).toBeInTheDocument()
      const nameInput = screen.getByLabelText('Nombre') as HTMLInputElement
      expect(nameInput).toHaveValue('Acme Corp')
      expect(screen.getByLabelText('Website')).toHaveValue('')
      expect(screen.getByLabelText('LinkedIn')).toHaveValue('https://linkedin.com/company/acme')
      // LECCIÓN (flaky preexistente, iteración QA 2026-07-04): al abrir un
      // Dialog desde un DropdownMenu, el returnFocus del menú puede robar el
      // foco tras el focus() de onOpenAutoFocus, y el FocusScope del Dialog lo
      // re-enfoca con select:true → la SELECCIÓN del input precargado es no
      // determinista en jsdom. No asertar selección aquí (no es AC de edición;
      // el foco se aserta con waitFor, ambos caminos terminan en el input).
      await waitFor(() => expect(nameInput).toHaveFocus())

      await user.clear(nameInput)
      await user.type(nameInput, 'Acme Corporation')
      await user.type(screen.getByLabelText('Website'), 'https://acme.example')
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.updateCompany)).toHaveBeenCalledWith('c-1', {
        name: 'Acme Corporation',
        website: 'https://acme.example',
        linkedinUrl: 'https://linkedin.com/company/acme',
        context: null
      })
      const toasts = await screen.findAllByText('Cambios guardados')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByRole('link', { name: 'Acme Corporation' })).toBeInTheDocument()
    })
  })

  describe('deleting a company', () => {
    // SPEC-011 · AC-07
    it('confirms in the cascade AlertDialog, deletes via deleteCompany and shows "Empresa eliminada"', async () => {
      const user = userEvent.setup()
      setCompanies([company()])
      vi.mocked(mockApi.api.db.deleteCompany).mockResolvedValue({ ok: true, data: null })
      renderAt('/discoveries/d-1')

      await screen.findByRole('link', { name: 'Acme Corp' })
      await openRowAction(user, 'Eliminar')

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Eliminar empresa' })).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          /Se eliminarán permanentemente «Acme Corp» y todos sus contactos y entrevistas\./
        )
      ).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

      expect(vi.mocked(mockApi.api.db.deleteCompany)).toHaveBeenCalledWith('c-1')
      const toasts = await screen.findAllByText('Empresa eliminada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByRole('link', { name: 'Acme Corp' })).not.toBeInTheDocument()
    })
  })

  describe('navigating to the company detail', () => {
    // SPEC-011 · AC-08
    it('navigates to the company detail when the row name is clicked', async () => {
      const user = userEvent.setup()
      setCompanies([company()])
      vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: company() })
      renderAt('/discoveries/d-1')

      await user.click(await screen.findByRole('link', { name: 'Acme Corp' }))

      expect(
        await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      ).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Contactos' })).toBeInTheDocument()
    })
  })

  describe('loading and mutation errors', () => {
    // SPEC-011 · AC-19 (representante: listCompanies pendiente)
    it('shows skeletons in the companies section while the list is loading', async () => {
      vi.mocked(mockApi.api.db.listCompanies).mockReturnValue(new Promise<never>(() => undefined))
      const { container } = renderAt('/discoveries/d-1')

      await screen.findByRole('heading', { name: 'Discovery Maurya', level: 1 })
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
      expect(screen.queryByText('Aún no hay empresas')).not.toBeInTheDocument()
    })

    // SPEC-011 · AC-20 (representante: creación de empresa fallida)
    it('shows an error toast and leaves the UI untouched when a mutation fails', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.createCompany).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'Fallo simulado al crear empresa' }
      })
      renderAt('/discoveries/d-1')

      const nameInput = await openCreateDialog(user)
      await user.type(nameInput, 'Empresa fallida')
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      const toasts = await screen.findAllByText('Fallo simulado al crear empresa')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // El Dialog sigue abierto y el listado sigue vacío (fondo aria-hidden)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Aún no hay empresas')).toBeInTheDocument()
    })
  })
})
