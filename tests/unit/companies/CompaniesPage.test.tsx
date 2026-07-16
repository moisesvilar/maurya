/**
 * Tests del listado global de empresas en /companies (SPEC-044,
 * AC-04..AC-11). REESCRITURA de la suite de la sección Empresas del detalle
 * de discovery (SPEC-011, AC-01/AC-03..AC-08 + AC-19/AC-20): SPEC-044
 * traslada la gestión de empresas a la página global CompaniesPage y retira
 * la sección del discovery — la intención verificadora de SPEC-011 (filas,
 * CRUD, validación, navegación y estados) se conserva íntegra contra la
 * página nueva. El AlertDialog de borrado asierta el texto NUEVO de la
 * cascada v3 (derogación del texto «y todas sus entrevistas» de SPEC-011).
 * Frontera de mocking: api.db. Rutas reales en MemoryRouter.
 * Lecciones aplicadas: dialogs del menú abren con setTimeout(0) → findBy*;
 * con un dialog modal abierto Radix marca el fondo aria-hidden → texto plano
 * o roles con hidden:true; toasts de sonner son <li> (no contar listitems).
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompaniesPage } from '@/pages/CompaniesPage'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import type { Company } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

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

/** Rutas reales de SPEC-044: listado global + detalle global. */
function renderCompanies(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/companies']}>
        <Routes>
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/:companyId" element={<CompanyDetailPage />} />
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
  setCompanies([])
})

describe('CompaniesPage', () => {
  describe('company rows', () => {
    // SPEC-044 · AC-04 (reescribe SPEC-011 · AC-01: TODAS las empresas del
    // sistema, nombre-Link al detalle GLOBAL, iconos condicionales y Acciones)
    it('lists ALL companies with the name link to the global detail, conditional external icons and the actions menu', async () => {
      setCompanies([
        // Con website pero SIN LinkedIn → solo el icono "Abrir website"
        company({ linkedinUrl: null }),
        // Y viceversa: sin website pero CON LinkedIn → solo "Abrir LinkedIn"
        company({ id: 'c-2', name: 'Beta Inc', website: null })
      ])
      renderCompanies()

      const list = await screen.findByTestId('companies-list')
      const acmeLink = within(list).getByRole('link', { name: 'Acme Corp' })
      expect(acmeLink).toHaveAttribute('href', '/companies/c-1')
      const acmeRow = acmeLink.closest('li')
      if (acmeRow === null) {
        throw new Error('Cada empresa debe renderizarse en una fila de lista propia')
      }
      expect(within(acmeRow).getByRole('link', { name: 'Abrir website' })).toBeInTheDocument()
      expect(within(acmeRow).queryByRole('link', { name: 'Abrir LinkedIn' })).toBeNull()
      expect(within(acmeRow).getByRole('button', { name: 'Acciones' })).toBeInTheDocument()

      const betaLink = within(list).getByRole('link', { name: 'Beta Inc' })
      expect(betaLink).toHaveAttribute('href', '/companies/c-2')
      const betaRow = betaLink.closest('li')
      if (betaRow === null) {
        throw new Error('Cada empresa debe renderizarse en una fila de lista propia')
      }
      expect(within(betaRow).queryByRole('link', { name: 'Abrir website' })).toBeNull()
      expect(within(betaRow).getByRole('link', { name: 'Abrir LinkedIn' })).toBeInTheDocument()
    })
  })

  describe('creating a company', () => {
    // SPEC-011 · AC-03 (reescrito contra CompaniesPage por SPEC-044 · AC-05:
    // mismo Dialog de empresa reutilizado)
    it('opens the "Nueva empresa" dialog with focus on Nombre and the optional URL fields', async () => {
      const user = userEvent.setup()
      renderCompanies()

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

    // SPEC-044 · AC-05 (reescribe SPEC-011 · AC-04: alta global sin
    // discoveryId — SPEC-043 —, Toast «Empresa creada» y fila en el listado)
    it('creates via createCompany normalizing empty optionals to null, shows the toast and lists the row', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.createCompany).mockResolvedValue({
        ok: true,
        data: company({ linkedinUrl: null })
      })
      renderCompanies()

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

    // SPEC-044 · AC-06 (reescribe SPEC-011 · AC-05)
    it('shows the inline "Campo requerido" error for an empty name without calling the bridge', async () => {
      const user = userEvent.setup()
      renderCompanies()

      await openCreateDialog(user)
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.createCompany)).not.toHaveBeenCalled()
    })
  })

  describe('editing a company', () => {
    // SPEC-044 · AC-07 (reescribe SPEC-011 · AC-06: mismo Dialog precargado)
    it('opens the edit dialog preloaded (null → empty), saves via updateCompany and shows "Cambios guardados"', async () => {
      const user = userEvent.setup()
      setCompanies([company({ website: null })])
      vi.mocked(mockApi.api.db.updateCompany).mockResolvedValue({
        ok: true,
        data: company({ name: 'Acme Corporation' })
      })
      renderCompanies()

      await screen.findByRole('link', { name: 'Acme Corp' })
      await openRowAction(user, 'Editar')

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Editar empresa' })).toBeInTheDocument()
      const nameInput = screen.getByLabelText('Nombre') as HTMLInputElement
      expect(nameInput).toHaveValue('Acme Corp')
      expect(screen.getByLabelText('Website')).toHaveValue('')
      expect(screen.getByLabelText('LinkedIn')).toHaveValue('https://linkedin.com/company/acme')
      // LECCIÓN (flaky, iteración QA 2026-07-04): al abrir un Dialog desde un
      // DropdownMenu, el returnFocus del menú puede robar el foco tras el
      // focus() de onOpenAutoFocus y el FocusScope del Dialog lo re-enfoca con
      // select:true → la SELECCIÓN del input precargado es no determinista en
      // jsdom. No asertar selección aquí; el foco se aserta con waitFor.
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
    // SPEC-044 · AC-08 (reescribe SPEC-011 · AC-07 con el texto NUEVO de la
    // cascada v3: contactos se eliminan, entrevistas se conservan sin empresa
    // — derogación del «y todos sus contactos y entrevistas» de SPEC-011)
    it('confirms in the v3-cascade AlertDialog (contacts deleted, interviews kept without company) and deletes with its toast', async () => {
      const user = userEvent.setup()
      setCompanies([company()])
      vi.mocked(mockApi.api.db.deleteCompany).mockResolvedValue({ ok: true, data: null })
      renderCompanies()

      await screen.findByRole('link', { name: 'Acme Corp' })
      await openRowAction(user, 'Eliminar')

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Eliminar empresa' })).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          /Se eliminarán permanentemente «Acme Corp» y sus contactos\. Sus entrevistas se conservarán sin empresa asignada\./
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
    // SPEC-011 · AC-08 (reescrito por SPEC-044: el destino es el detalle
    // GLOBAL /companies/:id)
    it('navigates to the global company detail when the row name is clicked', async () => {
      const user = userEvent.setup()
      setCompanies([company()])
      vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: company() })
      renderCompanies()

      await user.click(await screen.findByRole('link', { name: 'Acme Corp' }))

      expect(
        await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      ).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Contactos' })).toBeInTheDocument()
    })
  })

  describe('empty, error and loading states', () => {
    // SPEC-044 · AC-09
    it('shows the empty state with "Aún no hay empresas" and a functional "Añadir primera empresa" CTA', async () => {
      const user = userEvent.setup()
      renderCompanies()

      expect(await screen.findByText('Aún no hay empresas')).toBeInTheDocument()
      const cta = screen.getByRole('button', { name: 'Añadir primera empresa' })

      // CTA funcional: abre el mismo Dialog de creación
      await user.click(cta)
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Nueva empresa' })).toBeInTheDocument()
    })

    // SPEC-044 · AC-10
    it('shows the error state with the envelope message when listing fails', async () => {
      vi.mocked(mockApi.api.db.listCompanies).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'Fallo simulado al listar empresas' }
      })
      renderCompanies()

      expect(await screen.findByText('Fallo simulado al listar empresas')).toBeInTheDocument()
      expect(screen.queryByText('Aún no hay empresas')).not.toBeInTheDocument()
    })

    // SPEC-044 · AC-11 (reescribe SPEC-011 · AC-19)
    it('shows row skeletons while the companies list is loading', async () => {
      vi.mocked(mockApi.api.db.listCompanies).mockReturnValue(new Promise<never>(() => undefined))
      const { container } = renderCompanies()

      await screen.findByRole('heading', { name: 'Empresas', level: 1 })
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
      expect(screen.queryByText('Aún no hay empresas')).not.toBeInTheDocument()
    })

    // SPEC-011 · AC-20 (reescrito contra CompaniesPage: representante de
    // error de mutación — el envelope de fallo se mapea a toast destructive)
    it('shows an error toast and leaves the UI untouched when a mutation fails', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.createCompany).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'Fallo simulado al crear empresa' }
      })
      renderCompanies()

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
