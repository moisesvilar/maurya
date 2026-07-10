/**
 * Tests del shell de navegación (SPEC-009, AC-01..AC-07 y AC-14): sidebar,
 * top bar, redirect del index y 404. Se replica la tabla de rutas real de
 * App.tsx bajo <Layout/> en MemoryRouter (sin importar App).
 * SPEC-020: el ítem "Captura" pasa a "Capturas" (→ /captures, home nueva), el
 * index y la ruta legado /capture redirigen a /captures y el harness de spike
 * (SpikeAudioCapturePage) deja de estar enrutado — la réplica de rutas y las
 * aserciones se actualizan a ese contrato.
 * Lección vigente: máximo 1 hover de tooltip por render (grace area de Radix
 * anclado en jsdom tras el primer unhover).
 */
import { render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CapturesPage } from '@/pages/CapturesPage'
import { DiscoveriesPage } from '@/pages/DiscoveriesPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { NoteTemplateEditorPage } from '@/pages/NoteTemplateEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TemplatesHubPage } from '@/pages/TemplatesHubPage'
import { installMockApi } from '../../helpers/mockApi'

const STORAGE_KEY = 'maurya:sidebar-collapsed'

/** Réplica de la tabla de rutas de App.tsx (SPEC-009, actualizada por SPEC-020). */
function renderApp(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/captures" replace />} />
            <Route path="capture" element={<Navigate to="/captures" replace />} />
            <Route path="captures" element={<CapturesPage />} />
            <Route path="discoveries" element={<DiscoveriesPage />} />
            <Route path="templates" element={<TemplatesHubPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/note-templates/new" element={<NoteTemplateEditorPage />} />
            <Route path="settings/note-templates/:id" element={<NoteTemplateEditorPage />} />
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
  installMockApi()
})

describe('Layout (shell de navegación)', () => {
  describe('sidebar', () => {
    // SPEC-009 · AC-01 (ítem renombrado a "Capturas" por SPEC-020 AC-01)
    it('shows the sidebar with the four section items — "Capturas" among them — and the "Navegación principal" landmark', () => {
      renderApp('/discoveries')

      const sidebar = getSidebar()
      expect(within(sidebar).getByRole('link', { name: 'Discoveries' })).toBeInTheDocument()
      expect(within(sidebar).getByRole('link', { name: 'Plantillas' })).toBeInTheDocument()
      // SPEC-020 AC-01: mismo ítem (3ª posición, icono Mic) ahora "Capturas" → /captures
      const captures = within(sidebar).getByRole('link', { name: 'Capturas' })
      expect(captures).toHaveAttribute('href', '/captures')
      expect(within(sidebar).getByRole('link', { name: 'Ajustes' })).toBeInTheDocument()
      // Marca de la app en la cabecera del sidebar expandido
      expect(within(sidebar).getByText('Maurya')).toBeInTheDocument()
    })

    // SPEC-009 · AC-02
    it('navigates on item click and marks the active item with background and font weight (not color alone)', async () => {
      const user = userEvent.setup()
      renderApp('/captures')

      const sidebar = getSidebar()
      await user.click(within(sidebar).getByRole('link', { name: 'Discoveries' }))

      expect(await screen.findByText('Aún no hay discoveries')).toBeInTheDocument()
      // jsdom no computa estilos: el indicador activo se aserta por clases
      const active = within(sidebar).getByRole('link', { name: 'Discoveries' })
      expect(active).toHaveClass('bg-accent')
      expect(active).toHaveClass('font-medium')
      expect(within(sidebar).getByRole('link', { name: 'Capturas' })).not.toHaveClass('bg-accent')
    })

    // SPEC-009 · AC-03
    it('collapses to icons-only persisting the state in localStorage and across remounts', async () => {
      const user = userEvent.setup()
      const { unmount } = renderApp('/discoveries')

      await user.click(screen.getByRole('button', { name: 'Colapsar navegación' }))

      // Solo iconos: los labels quedan sr-only y la marca se reduce a "M"
      const sidebar = getSidebar()
      expect(within(sidebar).getByText('Discoveries')).toHaveClass('sr-only')
      expect(within(sidebar).getByText('M')).toBeInTheDocument()
      expect(within(sidebar).queryByText('Maurya')).not.toBeInTheDocument()
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')

      // Persistencia: un montaje nuevo (recarga simulada) arranca colapsado
      unmount()
      renderApp('/discoveries')
      expect(screen.getByRole('button', { name: 'Expandir navegación' })).toBeInTheDocument()
      expect(within(getSidebar()).getByText('Discoveries')).toHaveClass('sr-only')
    })

    // SPEC-009 · AC-03 (refuerzo: primer arranque con ventana estrecha → colapsado)
    it('starts collapsed on first launch when the window is narrower than 1024px', () => {
      const originalWidth = window.innerWidth
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
      try {
        renderApp('/discoveries')
        expect(screen.getByRole('button', { name: 'Expandir navegación' })).toBeInTheDocument()
        // El default por anchura no escribe en localStorage (solo el toggle)
        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
      } finally {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
      }
    })

    // SPEC-009 · AC-04
    it('expands back showing the labels when the expand button is clicked', async () => {
      const user = userEvent.setup()
      window.localStorage.setItem(STORAGE_KEY, 'true')
      renderApp('/discoveries')

      await user.click(screen.getByRole('button', { name: 'Expandir navegación' }))

      const sidebar = getSidebar()
      expect(within(sidebar).getByText('Discoveries')).not.toHaveClass('sr-only')
      expect(within(sidebar).getByText('Maurya')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Colapsar navegación' })).toBeInTheDocument()
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
    })

    // SPEC-009 · AC-05 (máx 1 hover de tooltip por render: lección Radix+jsdom)
    it('shows a tooltip with the section name when hovering an item of the collapsed sidebar', async () => {
      const user = userEvent.setup()
      window.localStorage.setItem(STORAGE_KEY, 'true')
      renderApp('/captures')

      const sidebar = getSidebar()
      await user.hover(within(sidebar).getByRole('link', { name: 'Plantillas' }))

      // El nombre aparece en el label sr-only + el contenido del tooltip
      const matches = await screen.findAllByText('Plantillas')
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('top bar', () => {
    // SPEC-009 · AC-06 (sección "Capturas" por SPEC-020)
    it('shows the active section title in the banner for each key route', () => {
      const { unmount: unmountCaptures } = renderApp('/captures')
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Capturas' })
      ).toBeInTheDocument()
      unmountCaptures()

      const { unmount: unmountDiscoveries } = renderApp('/discoveries')
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Discoveries' })
      ).toBeInTheDocument()
      unmountDiscoveries()

      // El editor de plantillas de notas sigue siendo sección "Ajustes"
      renderApp('/settings/note-templates/new')
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Ajustes' })
      ).toBeInTheDocument()
    })
  })

  describe('routes', () => {
    // SPEC-009 · AC-07 (home nueva por SPEC-020 AC-02: el index → /captures)
    it('redirects the index route to the Capturas section (SPEC-020 home)', async () => {
      renderApp('/')

      expect(await screen.findByText('Aún no hay capturas')).toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Capturas' })
      ).toBeInTheDocument()
    })

    // SPEC-009 · AC-14 (el link legado /capture aterriza en /captures vía redirect)
    it('shows the Spanish 404 page for unknown routes with a working "Ir a Captura" link', async () => {
      const user = userEvent.setup()
      renderApp('/ruta-que-no-existe')

      // El texto aparece en la página y también como título del top bar
      expect(screen.getAllByText('Página no encontrada').length).toBeGreaterThanOrEqual(1)
      await user.click(screen.getByRole('link', { name: 'Ir a Captura' }))

      // SPEC-020 AC-02: /capture redirige a /captures (listado global)
      expect(await screen.findByText('Aún no hay capturas')).toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Capturas' })
      ).toBeInTheDocument()
    })
  })
})
