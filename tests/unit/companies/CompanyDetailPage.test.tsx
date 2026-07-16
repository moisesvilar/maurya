/**
 * Tests del detalle de empresa y sus contactos (SPEC-011, AC-09..AC-18).
 * Adaptado por SPEC-044: el detalle es GLOBAL (/companies/:companyId), el
 * back button y el error state apuntan al listado global /companies
 * (CompaniesPage) y el AlertDialog de borrado de contacto avisa de que las
 * entrevistas lo perderán como participante (cascada v3).
 * getCompany NO tiene default en el helper → se mockea por test (beforeEach).
 * La apertura real en el navegador del sistema (shell.openExternal) es MANUAL:
 * aquí solo se verifica el markup del enlace externo (AC-18).
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompaniesPage } from '@/pages/CompaniesPage'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import type { Company, Contact } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const COMPANY: Company = {
  id: 'c-1',
  name: 'Acme Corp',
  website: 'https://acme.example/about',
  linkedinUrl: 'https://linkedin.com/company/acme',
  createdAt: '2026-07-02T12:00:00.000Z',
  updatedAt: '2026-07-02T12:00:00.000Z'
}

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'ct-1',
    companyId: 'c-1',
    name: 'Jane Doe',
    position: 'CTO',
    linkedinUrl: 'https://linkedin.com/in/janedoe',
    createdAt: '2026-07-03T12:00:00.000Z',
    updatedAt: '2026-07-03T12:00:00.000Z',
    ...overrides
  }
}

function setContacts(contacts: Contact[]): void {
  vi.mocked(mockApi.api.db.listContacts).mockResolvedValue({ ok: true, data: contacts })
}

/** Rutas reales de SPEC-044: detalle global + listado global (destino de Volver). */
function renderAt(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/:companyId" element={<CompanyDetailPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/** Abre el dialog de creación de contacto y devuelve el input Nombre. */
async function openCreateDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'Nuevo contacto' }))
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
  // getCompany no tiene default en createMockDbApi: se mockea aquí por test
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
  setContacts([])
})

describe('CompanyDetailPage', () => {
  describe('header', () => {
    // SPEC-011 · AC-09 (adaptado por SPEC-044 · AC-12: «Volver» regresa al
    // listado global /companies, no al detalle del discovery)
    it('shows the back button, the company title and its external links with visible hostnames', async () => {
      const user = userEvent.setup()
      renderAt('/companies/c-1')

      expect(
        await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      ).toBeInTheDocument()
      // Enlaces con el hostname visible como texto
      expect(screen.getByRole('link', { name: 'Abrir website' })).toHaveTextContent('acme.example')
      expect(screen.getByRole('link', { name: 'Abrir LinkedIn' })).toHaveTextContent('linkedin.com')
      expect(screen.getByRole('heading', { name: 'Contactos' })).toBeInTheDocument()

      // "Volver" regresa al listado global de Empresas (SPEC-044)
      await user.click(screen.getByRole('button', { name: 'Volver' }))
      expect(await screen.findByRole('heading', { name: 'Empresas', level: 1 })).toBeInTheDocument()
      expect(await screen.findByText('Aún no hay empresas')).toBeInTheDocument()
    })
  })

  describe('contact rows', () => {
    // SPEC-011 · AC-10
    it('renders each contact row with name, muted position, LinkedIn icon link and actions menu', async () => {
      setContacts([contact()])
      renderAt('/companies/c-1')

      const name = await screen.findByText('Jane Doe')
      // La cabecera de la empresa también tiene su "Abrir LinkedIn": se acota a la fila
      const row = name.closest('li')
      if (row === null) {
        throw new Error('El contacto debe renderizarse en una fila de lista propia')
      }
      expect(within(row).getByText('CTO')).toBeInTheDocument()
      expect(within(row).getByRole('link', { name: 'Abrir LinkedIn' })).toHaveAttribute(
        'href',
        'https://linkedin.com/in/janedoe'
      )
      expect(within(row).getByRole('button', { name: 'Acciones' })).toBeInTheDocument()
    })

    // SPEC-011 · AC-11
    it('shows the contacts empty state with the "Añadir primer contacto" CTA', async () => {
      renderAt('/companies/c-1')

      expect(await screen.findByText('Aún no hay contactos')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Añadir primer contacto' })).toBeInTheDocument()
    })
  })

  describe('creating a contact', () => {
    // SPEC-011 · AC-12
    it('opens the "Nuevo contacto" dialog with focus on Nombre and the optional fields', async () => {
      const user = userEvent.setup()
      renderAt('/companies/c-1')

      const nameInput = await openCreateDialog(user)

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Nuevo contacto' })).toBeInTheDocument()
      expect(document.activeElement).toBe(nameInput)
      expect(screen.getByLabelText('Posición')).toHaveAttribute(
        'placeholder',
        'CEO, Head of Product…'
      )
      expect(screen.getByLabelText('LinkedIn')).toHaveAttribute(
        'placeholder',
        'https://linkedin.com/in/...'
      )
    })

    // SPEC-011 · AC-13
    it('creates via createContact with normalized optionals, shows "Contacto creado" and lists the row', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.createContact).mockResolvedValue({
        ok: true,
        data: contact({ linkedinUrl: null })
      })
      renderAt('/companies/c-1')

      const nameInput = await openCreateDialog(user)
      await user.type(nameInput, 'Jane Doe')
      await user.type(screen.getByLabelText('Posición'), 'CTO')
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      expect(vi.mocked(mockApi.api.db.createContact)).toHaveBeenCalledWith({
        companyId: 'c-1',
        name: 'Jane Doe',
        position: 'CTO',
        linkedinUrl: null,
        context: null
      })
      const toasts = await screen.findAllByText('Contacto creado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })

    // SPEC-011 · AC-14
    it('shows the inline "Campo requerido" error for an empty name without calling the bridge', async () => {
      const user = userEvent.setup()
      renderAt('/companies/c-1')

      await openCreateDialog(user)
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.createContact)).not.toHaveBeenCalled()
    })
  })

  describe('editing a contact', () => {
    // SPEC-011 · AC-15
    it('opens the edit dialog preloaded, saves via updateContact and shows "Cambios guardados"', async () => {
      const user = userEvent.setup()
      setContacts([contact()])
      vi.mocked(mockApi.api.db.updateContact).mockResolvedValue({
        ok: true,
        data: contact({ position: 'VP of Engineering' })
      })
      renderAt('/companies/c-1')

      await screen.findByText('Jane Doe')
      await openRowAction(user, 'Editar')

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Editar contacto' })).toBeInTheDocument()
      expect(screen.getByLabelText('Nombre')).toHaveValue('Jane Doe')
      const positionInput = screen.getByLabelText('Posición')
      expect(positionInput).toHaveValue('CTO')

      await user.clear(positionInput)
      await user.type(positionInput, 'VP of Engineering')
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.updateContact)).toHaveBeenCalledWith('ct-1', {
        name: 'Jane Doe',
        position: 'VP of Engineering',
        linkedinUrl: 'https://linkedin.com/in/janedoe',
        context: null
      })
      const toasts = await screen.findAllByText('Cambios guardados')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByText('VP of Engineering')).toBeInTheDocument()
    })
  })

  describe('deleting a contact', () => {
    // SPEC-011 · AC-16 (adaptado por SPEC-044 · AC-17: la descripción avisa de
    // que las entrevistas que lo referencian lo perderán como participante)
    it('confirms in the AlertDialog warning that interviews lose the participant, deletes via deleteContact and shows "Contacto eliminado"', async () => {
      const user = userEvent.setup()
      setContacts([contact()])
      vi.mocked(mockApi.api.db.deleteContact).mockResolvedValue({ ok: true, data: null })
      renderAt('/companies/c-1')

      await screen.findByText('Jane Doe')
      await openRowAction(user, 'Eliminar')

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Eliminar contacto' })).toBeInTheDocument()
      // SPEC-044 (cascada v3): consecuencia explícita sobre las entrevistas
      expect(
        within(dialog).getByText(
          /Se eliminará permanentemente «Jane Doe»\. Las entrevistas que lo referencian lo perderán como participante\./
        )
      ).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

      expect(vi.mocked(mockApi.api.db.deleteContact)).toHaveBeenCalledWith('ct-1')
      const toasts = await screen.findAllByText('Contacto eliminado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
    })
  })

  describe('nonexistent company', () => {
    // SPEC-011 · AC-17 (adaptado por SPEC-044 · AC-13: la salida del error
    // state es el listado global «Volver a Empresas»)
    it('shows the error state with the "Volver a Empresas" link when getCompany fails', async () => {
      vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({
        ok: false,
        error: { kind: 'not-found', message: 'No existe empresa con id c-404' }
      })
      renderAt('/companies/c-404')

      expect(await screen.findByText('No existe empresa con id c-404')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Volver a Empresas' })).toHaveAttribute(
        'href',
        '/companies'
      )
    })
  })

  describe('external links markup', () => {
    // SPEC-011 · AC-18 (unit: solo el markup; la apertura en el navegador del
    // sistema vía setWindowOpenHandler → shell.openExternal es MANUAL)
    it('renders external links with target=_blank, rel=noreferrer and the exact href', async () => {
      renderAt('/companies/c-1')

      const websiteLink = await screen.findByRole('link', { name: 'Abrir website' })
      expect(websiteLink).toHaveAttribute('href', 'https://acme.example/about')
      expect(websiteLink).toHaveAttribute('target', '_blank')
      expect(websiteLink).toHaveAttribute('rel', 'noreferrer')

      const linkedinLink = screen.getByRole('link', { name: 'Abrir LinkedIn' })
      expect(linkedinLink).toHaveAttribute('href', 'https://linkedin.com/company/acme')
      expect(linkedinLink).toHaveAttribute('target', '_blank')
      expect(linkedinLink).toHaveAttribute('rel', 'noreferrer')
    })
  })
})
