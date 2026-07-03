/**
 * Tests del shell de navegación (SPEC-009, AC-01..AC-07 y AC-14): sidebar,
 * top bar, redirect del index y 404. Se replica la tabla de rutas real de
 * App.tsx bajo <Layout/> en MemoryRouter (sin importar App). Los servicios del
 * harness de captura van mockeados porque /capture es la home.
 * Lección vigente: máximo 1 hover de tooltip por render (grace area de Radix
 * anclado en jsdom tras el primer unhover).
 */
import { render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DiscoveriesPage } from '@/pages/DiscoveriesPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { NoteTemplateEditorPage } from '@/pages/NoteTemplateEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SpikeAudioCapturePage } from '@/pages/SpikeAudioCapturePage'
import { TemplatesHubPage } from '@/pages/TemplatesHubPage'
import { getPermissionsStatus } from '@/services/permissionsService'
import { listAudioInputDevices } from '@/services/captureService'
import { installMockApi } from '../../helpers/mockApi'

vi.mock('@/services/permissionsService', () => ({
  getPermissionsStatus: vi.fn(),
  requestMicrophoneAccess: vi.fn(),
  openPrivacySettings: vi.fn()
}))

vi.mock('@/services/captureService', () => ({
  DEFAULT_DEVICE_ID: '__default__',
  acquireMicrophoneStream: vi.fn(),
  acquireSystemAudioStream: vi.fn(),
  listAudioInputDevices: vi.fn(),
  stopStream: vi.fn()
}))

vi.mock('@/services/wavRecorderService', () => ({
  CAPTURE_SAMPLE_RATE: 16000,
  WavRecorderService: class {
    start = vi.fn()
    stop = vi.fn()
    getLevels = vi.fn()
  }
}))

const STORAGE_KEY = 'maurya:sidebar-collapsed'

/** Réplica de la tabla de rutas de App.tsx (SPEC-009). */
function renderApp(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/capture" replace />} />
            <Route path="capture" element={<SpikeAudioCapturePage />} />
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
  vi.clearAllMocks()
  window.localStorage.clear()
  installMockApi()
  vi.mocked(getPermissionsStatus).mockResolvedValue({
    microphone: 'granted',
    systemAudio: 'granted'
  })
  vi.mocked(listAudioInputDevices).mockResolvedValue([])
})

describe('Layout (shell de navegación)', () => {
  describe('sidebar', () => {
    // SPEC-009 · AC-01
    it('shows the sidebar with the four section items and the "Navegación principal" landmark', () => {
      renderApp('/discoveries')

      const sidebar = getSidebar()
      expect(within(sidebar).getByRole('link', { name: 'Discoveries' })).toBeInTheDocument()
      expect(within(sidebar).getByRole('link', { name: 'Plantillas' })).toBeInTheDocument()
      expect(within(sidebar).getByRole('link', { name: 'Captura' })).toBeInTheDocument()
      expect(within(sidebar).getByRole('link', { name: 'Ajustes' })).toBeInTheDocument()
      // Marca de la app en la cabecera del sidebar expandido
      expect(within(sidebar).getByText('Maurya')).toBeInTheDocument()
    })

    // SPEC-009 · AC-02
    it('navigates on item click and marks the active item with background and font weight (not color alone)', async () => {
      const user = userEvent.setup()
      renderApp('/capture')

      const sidebar = getSidebar()
      await user.click(within(sidebar).getByRole('link', { name: 'Discoveries' }))

      expect(await screen.findByText('Aún no hay discoveries')).toBeInTheDocument()
      // jsdom no computa estilos: el indicador activo se aserta por clases
      const active = within(sidebar).getByRole('link', { name: 'Discoveries' })
      expect(active).toHaveClass('bg-accent')
      expect(active).toHaveClass('font-medium')
      expect(within(sidebar).getByRole('link', { name: 'Captura' })).not.toHaveClass('bg-accent')
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
      renderApp('/capture')

      const sidebar = getSidebar()
      await user.hover(within(sidebar).getByRole('link', { name: 'Plantillas' }))

      // El nombre aparece en el label sr-only + el contenido del tooltip
      const matches = await screen.findAllByText('Plantillas')
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('top bar', () => {
    // SPEC-009 · AC-06
    it('shows the active section title in the banner for each key route', () => {
      const { unmount: unmountCapture } = renderApp('/capture')
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Captura' })
      ).toBeInTheDocument()
      unmountCapture()

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
    // SPEC-009 · AC-07
    it('redirects the index route to the Captura section (provisional home)', async () => {
      renderApp('/')

      expect(await screen.findByRole('button', { name: 'Iniciar captura' })).toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Captura' })
      ).toBeInTheDocument()
    })

    // SPEC-009 · AC-14
    it('shows the Spanish 404 page for unknown routes with a working "Ir a Captura" link', async () => {
      const user = userEvent.setup()
      renderApp('/ruta-que-no-existe')

      // El texto aparece en la página y también como título del top bar
      expect(screen.getAllByText('Página no encontrada').length).toBeGreaterThanOrEqual(1)
      await user.click(screen.getByRole('link', { name: 'Ir a Captura' }))

      expect(await screen.findByRole('button', { name: 'Iniciar captura' })).toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Captura' })
      ).toBeInTheDocument()
    })
  })
})
