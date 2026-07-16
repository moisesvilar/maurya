/**
 * Tests del detalle mínimo de discovery (SPEC-010, AC-15..AC-17). El detalle
 * resuelve el discovery con listDiscoveries + find (no hay getDiscovery).
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
    // SPEC-010 · AC-15 (derogado parcialmente por SPEC-011 AC-02: el empty
    // state de empresas perdió el secundario provisional y ganó CTA funcional)
    it('opens /discoveries/:id from the row name showing the title and the companies empty state', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries')

      await user.click(await screen.findByRole('link', { name: 'Discovery Maurya' }))

      expect(
        await screen.findByRole('heading', { name: 'Discovery Maurya', level: 1 })
      ).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Empresas' })).toBeInTheDocument()
      expect(await screen.findByText('Aún no hay empresas')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Añadir primera empresa' })).toBeInTheDocument()
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
