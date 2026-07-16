/**
 * Tests del detalle mínimo de discovery (SPEC-010, AC-15..AC-17). El detalle
 * resuelve el discovery con listDiscoveries + find (no hay getDiscovery).
 * SPEC-044 (AC-23) retira la sección Empresas del detalle (la gestión vive en
 * /companies): el test de AC-15 se adapta — el detalle muestra el h1 y ya NO
 * renderiza la sección «Empresas» (el resto queda intacto hasta H11.3).
 */
import { render, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DiscoveriesPage } from '@/pages/DiscoveriesPage'
import { DiscoveryDetailPage } from '@/pages/DiscoveryDetailPage'
import type { Discovery } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const DISCOVERY: Discovery = {
  id: 'd-1',
  name: 'Discovery Maurya',
  objectives: null,
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z'
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

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.listDiscoveries).mockResolvedValue({ ok: true, data: [DISCOVERY] })
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
})
