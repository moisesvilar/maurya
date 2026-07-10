/**
 * Tests de las secciones bajo el layout (SPEC-009, AC-08..AC-12): Discoveries,
 * hub de Plantillas, Ajustes sin "Volver" y editor con "Volver". Misma réplica
 * de rutas reales que Layout.test.tsx.
 * SPEC-020: la sección Captura (harness de spike) deja de estar enrutada — el
 * AC-12 original queda derogado y su sitio lo ocupa la verificación de que la
 * ruta legado /capture redirige al listado global de Capturas.
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
import { InterviewTemplatesPage } from '@/pages/InterviewTemplatesPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { NoteTemplateEditorPage } from '@/pages/NoteTemplateEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TemplatesHubPage } from '@/pages/TemplatesHubPage'
import { installMockApi } from '../../helpers/mockApi'

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
            <Route path="templates/interview" element={<InterviewTemplatesPage />} />
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
  window.localStorage.clear()
  installMockApi()
})

describe('secciones bajo el layout (SPEC-009)', () => {
  describe('Discoveries', () => {
    // SPEC-009 · AC-08 (derogado parcialmente por SPEC-010: el empty state
    // ahora carga del bridge, tiene CTA funcional y perdió el texto provisional)
    it('shows the Discoveries empty state with its functional CTA under the layout', async () => {
      renderApp('/discoveries')

      expect(await screen.findByText('Aún no hay discoveries')).toBeInTheDocument()
      expect(
        within(screen.getByRole('main')).getByRole('button', { name: 'Crear primer discovery' })
      ).toBeInTheDocument()
    })
  })

  describe('Plantillas (hub)', () => {
    // SPEC-009 · AC-09 (derogado por SPEC-012 AC-01: la card de entrevistas
    // pasó a ser clicable con descripción nueva, sin "Disponible próximamente")
    it('shows both template cards, each navigating to its destination', async () => {
      const user = userEvent.setup()
      const { unmount } = renderApp('/templates')

      // Card de entrevistas: clicable, con la descripción nueva de SPEC-012
      expect(screen.queryByText('Disponible próximamente')).not.toBeInTheDocument()
      expect(screen.getByText('Cuestionarios base para tus entrevistas')).toBeInTheDocument()
      const interviewLink = screen.getByText('Plantillas de entrevista').closest('a')
      if (interviewLink === null) {
        throw new Error('La card de Plantillas de entrevista debe ser un enlace')
      }
      await user.click(interviewLink)
      expect(await screen.findByText('Aún no hay plantillas de entrevista')).toBeInTheDocument()

      // Card de notas: clicable → pestaña de plantillas de notas de Ajustes
      unmount()
      renderApp('/templates')
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

  describe('Capturas bajo el layout', () => {
    // SPEC-009 · AC-12 DEROGADO por SPEC-020 (el harness de spike queda sin
    // ruta); en su lugar se fija el contrato nuevo: SPEC-020 AC-02.
    it('redirects the legacy /capture route to the global captures list under the layout', async () => {
      renderApp('/capture')

      // El listado global de Capturas es el destino (empty state por defecto)
      expect(await screen.findByText('Aún no hay capturas')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear primera captura' })).toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).getByRole('heading', { name: 'Capturas' })
      ).toBeInTheDocument()
      // Y el harness de spike ya no se monta ("Iniciar captura" era su CTA)
      expect(screen.queryByRole('button', { name: 'Iniciar captura' })).not.toBeInTheDocument()
    })
  })
})
