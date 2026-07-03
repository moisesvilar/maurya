/**
 * Tests de las secciones bajo el layout (SPEC-009, AC-08..AC-12): Discoveries,
 * hub de Plantillas, Ajustes sin "Volver", editor con "Volver" y Captura sin
 * engranaje. Misma réplica de rutas reales que Layout.test.tsx.
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

describe('secciones bajo el layout (SPEC-009)', () => {
  describe('Discoveries', () => {
    // SPEC-009 · AC-08
    it('shows the Discoveries empty state with its secondary text and no functional CTA', () => {
      renderApp('/discoveries')

      expect(screen.getByText('Aún no hay discoveries')).toBeInTheDocument()
      expect(
        screen.getByText('La gestión de discoveries llegará en la siguiente fase')
      ).toBeInTheDocument()
      // Sin CTA funcional todavía (H2): ningún botón en el área de contenido
      expect(within(screen.getByRole('main')).queryAllByRole('button')).toHaveLength(0)
    })
  })

  describe('Plantillas (hub)', () => {
    // SPEC-009 · AC-09
    it('shows the disabled interview-templates card and a notes card that navigates to the settings tab', async () => {
      const user = userEvent.setup()
      renderApp('/templates')

      // Card de entrevistas: "Disponible próximamente", no clicable (sin enlace)
      expect(screen.getByText('Disponible próximamente')).toBeInTheDocument()
      expect(screen.getByText('Plantillas de entrevista').closest('a')).toBeNull()

      // Card de notas: clicable → pestaña de plantillas de notas de Ajustes
      const notesLink = screen.getByText('Plantillas de notas').closest('a')
      if (notesLink === null) {
        throw new Error('La card de Plantillas de notas debe ser un enlace')
      }
      await user.click(notesLink)

      expect(await screen.findByRole('tab', { name: 'Plantillas de notas' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      expect(await screen.findByText('Aún no hay plantillas de notas')).toBeInTheDocument()
    })
  })

  describe('Ajustes bajo el layout', () => {
    // SPEC-009 · AC-10
    it('keeps the settings tabs functional and no longer shows the "Volver" back button', async () => {
      const user = userEvent.setup()
      renderApp('/settings')

      expect(await screen.findByRole('tab', { name: 'Claves de IA' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      // El back button desapareció: la navegación la da el sidebar (regla 2.3)
      expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument()

      // Tabs funcionales (SPEC-007/008 intactos)
      expect(screen.getByLabelText('Deepgram (transcripción)')).toBeInTheDocument()
      await user.click(screen.getByRole('tab', { name: 'Plantillas de notas' }))
      expect(await screen.findByText('Aún no hay plantillas de notas')).toBeInTheDocument()
    })
  })

  describe('editor de plantillas bajo el layout', () => {
    // SPEC-009 · AC-11
    it('keeps the "Volver" back button in the note-template editor (detail flow) under the layout', async () => {
      const user = userEvent.setup()
      renderApp('/settings/note-templates/new')

      expect(screen.getByRole('heading', { name: 'Nueva plantilla' })).toBeInTheDocument()
      const backButton = screen.getByRole('button', { name: 'Volver' })
      expect(backButton).toBeInTheDocument()
      // Y el sidebar sigue presente (el editor vive bajo el layout)
      expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()

      // Volver (sin cambios) regresa al listado de plantillas de Ajustes
      await user.click(backButton)
      expect(await screen.findByRole('tab', { name: 'Plantillas de notas' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    })
  })

  describe('Captura bajo el layout', () => {
    // SPEC-009 · AC-12
    it('renders the working capture harness without the settings gear button', async () => {
      renderApp('/capture')

      // El harness funciona igual que hasta ahora (ambos permisos concedidos
      // → dos badges 'Concedido', una por fuente)
      expect(await screen.findByRole('button', { name: 'Iniciar captura' })).toBeInTheDocument()
      expect(await screen.findAllByText('Concedido')).toHaveLength(2)
      expect(screen.getByText('Audio del sistema')).toBeInTheDocument()

      // Sin engranaje: Ajustes se alcanza por el sidebar (que sí tiene su link)
      expect(screen.queryByRole('button', { name: 'Ajustes' })).not.toBeInTheDocument()
      const sidebar = screen.getByRole('navigation', { name: 'Navegación principal' })
      expect(within(sidebar).getByRole('link', { name: 'Ajustes' })).toBeInTheDocument()
    })
  })
})
