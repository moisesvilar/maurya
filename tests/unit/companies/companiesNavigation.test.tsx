/**
 * Tests de navegación de la sección Empresas (SPEC-044, AC-01..AC-03): ítem
 * «Empresas» del sidebar entre «Discoveries» y el resto, título «Empresas» en
 * el top bar con el ítem activo (también en el detalle, por prefijo) y
 * redirect de la ruta anidada legada al detalle global.
 * Se replica la tabla de rutas real de App.tsx bajo <Layout/> en MemoryRouter
 * (patrón de tests/unit/layout, SPEC-009/SPEC-020), incluida una réplica del
 * LegacyCompanyRedirect de App.tsx (no exportado): Navigate replace
 * interpolando el companyId de useParams. El flag `replace` (sin entrada
 * extra en el historial) no es observable desde MemoryRouter → MANUAL.
 */
import React from 'react'
import { render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CapturesPage } from '@/pages/CapturesPage'
import { CompaniesPage } from '@/pages/CompaniesPage'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { DiscoveriesPage } from '@/pages/DiscoveriesPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import type { Company } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const COMPANY: Company = {
  id: 'c-1',
  name: 'Acme Corp',
  website: null,
  linkedinUrl: null,
  createdAt: '2026-07-02T12:00:00.000Z',
  updatedAt: '2026-07-02T12:00:00.000Z'
}

/** Réplica del LegacyCompanyRedirect de App.tsx (SPEC-044, no exportado). */
function LegacyCompanyRedirect(): React.ReactElement {
  const { companyId } = useParams<{ companyId: string }>()
  return <Navigate to={`/companies/${companyId ?? ''}`} replace />
}

/** Réplica de la tabla de rutas de App.tsx (actualizada por SPEC-044). */
function renderApp(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/captures" replace />} />
            <Route path="captures" element={<CapturesPage />} />
            <Route path="discoveries" element={<DiscoveriesPage />} />
            <Route
              path="discoveries/:discoveryId/companies/:companyId"
              element={<LegacyCompanyRedirect />}
            />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="companies/:companyId" element={<CompanyDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

function getSidebar(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Navegación principal' })
}

beforeEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
  mockApi = installMockApi()
})

describe('Empresas (navegación, SPEC-044)', () => {
  describe('sidebar item', () => {
    // SPEC-044 · AC-01
    it('shows the "Empresas" item between "Discoveries" and the rest, navigating to /companies', async () => {
      const user = userEvent.setup()
      renderApp('/discoveries')

      const sidebar = getSidebar()
      const empresas = within(sidebar).getByRole('link', { name: 'Empresas' })
      expect(empresas).toHaveAttribute('href', '/companies')

      // Posición: después de «Discoveries» y antes del resto («Plantillas»)
      const discoveries = within(sidebar).getByRole('link', { name: 'Discoveries' })
      const plantillas = within(sidebar).getByRole('link', { name: 'Plantillas' })
      expect(
        discoveries.compareDocumentPosition(empresas) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      expect(
        empresas.compareDocumentPosition(plantillas) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()

      // El click navega al listado global
      await user.click(empresas)
      expect(await screen.findByText('Aún no hay empresas')).toBeInTheDocument()
    })
  })

  describe('top bar and active item', () => {
    // SPEC-044 · AC-02
    it('shows the "Empresas" title in the banner and marks the sidebar item active on /companies (also on the detail)', async () => {
      const { unmount } = renderApp('/companies')

      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Empresas' })
      ).toBeInTheDocument()
      // Indicador activo por clases (jsdom no computa estilos)
      const active = within(getSidebar()).getByRole('link', { name: 'Empresas' })
      expect(active).toHaveClass('bg-accent')
      expect(active).toHaveClass('font-medium')
      expect(within(getSidebar()).getByRole('link', { name: 'Discoveries' })).not.toHaveClass(
        'bg-accent'
      )
      unmount()

      // El estado activo por prefijo cubre también /companies/:companyId
      vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
      renderApp('/companies/c-1')
      expect(
        await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      ).toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Empresas' })
      ).toBeInTheDocument()
      expect(within(getSidebar()).getByRole('link', { name: 'Empresas' })).toHaveClass('bg-accent')
    })
  })

  describe('legacy route redirect', () => {
    // SPEC-044 · AC-03 (réplica del redirect de App.tsx; el flag replace es
    // MANUAL — no observable desde MemoryRouter)
    it('redirects the legacy /discoveries/:discoveryId/companies/:companyId route to the global detail', async () => {
      vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
      renderApp('/discoveries/d-1/companies/c-1')

      // Aterriza en el detalle GLOBAL: título de sección «Empresas» y la
      // empresa resuelta por el companyId interpolado del path legado
      expect(
        await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      ).toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Empresas' })
      ).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.getCompany)).toHaveBeenCalledWith('c-1')
      // Y no cae en la 404 del layout
      expect(screen.queryByText('Página no encontrada')).not.toBeInTheDocument()
    })
  })
})
