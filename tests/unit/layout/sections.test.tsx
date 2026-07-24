/**
 * Tests de las secciones bajo el layout (SPEC-009, AC-08/AC-10..AC-12):
 * Discoveries, Ajustes sin "Volver" y editor con "Volver". Misma réplica de
 * rutas reales que Layout.test.tsx.
 * SPEC-020: la sección Captura (harness de spike) deja de estar enrutada — el
 * AC-12 original queda derogado y su sitio lo ocupa la verificación de que la
 * ruta legado /capture redirige al listado global de Capturas.
 * SPEC-051: el hub de Plantillas desaparece (su gestión se muda a Ajustes) —
 * el AC-09 (hub con dos cards) queda derogado; su cobertura se retira de aquí
 * y la unificación se verifica en tests/unit/interview-templates/*.
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
import { installMockApi } from '../../helpers/mockApi'

/** Réplica de la tabla de rutas de App.tsx (SPEC-009, actualizada por SPEC-020/051). */
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
