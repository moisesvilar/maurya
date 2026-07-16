/**
 * Tests del detalle GLOBAL de empresa en /companies/:companyId (SPEC-044,
 * AC-12/AC-14/AC-15): cabecera con «Volver»/«Editar» y las MISMAS secciones
 * del detalle anterior en el mismo orden (Contexto → Contactos → Entrevistas),
 * y conservación sin regresiones del comportamiento de Contexto (mensaje de
 * vacío + generación con IA si hay clave/fuentes) y de la generación de
 * contexto de contacto desde LinkedIn (si MCP configurado).
 * El back button (AC-12), el error state (AC-13), los contactos (AC-15/16/17)
 * y las entrevistas (AC-18..AC-22) se cubren en las suites adaptadas
 * CompanyDetailPage.test.tsx y CompanyDetailPage.interviews.test.tsx.
 * Frontera de mocking: api.db + api.llm (capacidades del contexto).
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import type { Company, Contact } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const COMPANY: Company = {
  id: 'c-1',
  name: 'Acme Corp',
  website: 'https://acme.example',
  linkedinUrl: 'https://linkedin.com/company/acme',
  context: null,
  createdAt: '2026-07-02T12:00:00.000Z',
  updatedAt: '2026-07-02T12:00:00.000Z'
}

const CONTACT: Contact = {
  id: 'ct-1',
  companyId: 'c-1',
  name: 'Jane Doe',
  position: 'CTO',
  linkedinUrl: 'https://linkedin.com/in/janedoe',
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z'
}

function renderDetail(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/companies/c-1']}>
        <Routes>
          <Route path="/companies/:companyId" element={<CompanyDetailPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/** a precede a b en el orden del documento. */
function expectBefore(a: HTMLElement, b: HTMLElement): void {
  expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
})

describe('CompanyDetailPage (detalle global, SPEC-044)', () => {
  describe('header and section order', () => {
    // SPEC-044 · AC-12: back button «Volver», cabecera con nombre + iconos +
    // «Editar», y las mismas secciones del detalle anterior en el mismo orden
    it('shows Volver, the header with external icons and Editar, and the sections Contexto → Contactos → Entrevistas in order', async () => {
      renderDetail()

      const title = await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Abrir website' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Abrir LinkedIn' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()

      const contexto = screen.getByRole('heading', { name: 'Contexto' })
      const contactos = screen.getByRole('heading', { name: 'Contactos' })
      const entrevistas = screen.getByRole('heading', { name: 'Entrevistas' })
      expectBefore(title, contexto)
      expectBefore(contexto, contactos)
      expectBefore(contactos, entrevistas)
    })
  })

  describe('company context (conserved behavior)', () => {
    // SPEC-044 · AC-14: sin contexto se conserva el comportamiento actual —
    // mensaje de vacío y generación con IA disponible si hay clave y fuentes
    it('keeps the empty-context message and enables "Generar con IA" when the key and a source exist', async () => {
      vi.mocked(mockApi.api.llm.getContextCapabilities).mockResolvedValue({
        ok: true,
        data: { hasAnthropicKey: true, linkedinMcpConfigured: false }
      })
      renderDetail()

      await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      expect(screen.getByText(/Aún no hay contexto\./)).toBeInTheDocument()
      // Con clave de Anthropic + website como fuente, el botón está habilitado
      const generateButton = await screen.findByRole('button', { name: 'Generar con IA' })
      await waitFor(() => expect(generateButton).toBeEnabled())
    })

    // SPEC-044 · AC-14 (rama degradada conservada: sin clave el botón queda
    // deshabilitado y el mensaje de vacío sigue presente)
    it('keeps "Generar con IA" disabled without the Anthropic key (default capabilities)', async () => {
      renderDetail()

      await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      expect(screen.getByText(/Aún no hay contexto\./)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Generar con IA' })).toBeDisabled()
    })
  })

  describe('contact context generation (conserved behavior)', () => {
    // SPEC-044 · AC-15: la fila del contacto conserva la generación de
    // contexto desde LinkedIn cuando el MCP y la clave están configurados
    it('enables the "Generar contexto desde LinkedIn" row action and calls the bridge when MCP is configured', async () => {
      vi.mocked(mockApi.api.llm.getContextCapabilities).mockResolvedValue({
        ok: true,
        data: { hasAnthropicKey: true, linkedinMcpConfigured: true }
      })
      vi.mocked(mockApi.api.db.listContacts).mockResolvedValue({ ok: true, data: [CONTACT] })
      vi.mocked(mockApi.api.llm.generateContactContext).mockResolvedValue({
        ok: true,
        data: { ...CONTACT, context: 'Contexto generado' }
      })
      const user = userEvent.setup()
      renderDetail()

      const name = await screen.findByText('Jane Doe')
      const row = name.closest('li')
      if (row === null) {
        throw new Error('El contacto debe renderizarse en una fila de lista propia')
      }
      const generateButton = within(row).getByRole('button', {
        name: 'Generar contexto desde LinkedIn'
      })
      await waitFor(() => expect(generateButton).toBeEnabled())

      await user.click(generateButton)

      expect(vi.mocked(mockApi.api.llm.generateContactContext)).toHaveBeenCalledWith('ct-1')
      const toasts = await screen.findAllByText('Contexto del contacto generado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })
  })
})
