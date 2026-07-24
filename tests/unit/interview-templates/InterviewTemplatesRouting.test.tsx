/**
 * SPEC-051: navegación global y rutas legadas de la unificación de plantillas
 * (AC-17..AC-22). Réplica de la tabla de rutas real de App.tsx bajo <Layout/>
 * en MemoryRouter (incluidos los 4 redirects legados y el mini-componente
 * LegacyInterviewTemplateRedirect). Frontera de mocking: api.db/api.secrets del
 * bridge (defaults de installMockApi + getInterviewTemplate por test).
 */
import React from 'react'
import { render, screen, within, type RenderResult } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InterviewTemplateEditorPage } from '@/pages/InterviewTemplateEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import type { InterviewTemplate } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const EXISTING: InterviewTemplate = {
  id: 'tpl-1',
  name: 'Plantilla base',
  phase: 'problem',
  blocks: [{ title: 'Bloque A', questions: [{ text: 'Pregunta A1' }] }],
  createdAt: '2026-07-04T10:00:00.000Z',
  updatedAt: '2026-07-04T10:00:00.000Z'
}

/** Mini-componente legado (réplica de App.tsx): conserva el :id al redirigir. */
function LegacyInterviewTemplateRedirect(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/settings/interview-templates/${id ?? ''}`} replace />
}

/** Réplica de la tabla de rutas de App.tsx relevante para SPEC-051 (bajo Layout). */
function renderApp(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route
              path="templates"
              element={<Navigate to="/settings?tab=interview-templates" replace />}
            />
            <Route
              path="templates/interview"
              element={<Navigate to="/settings?tab=interview-templates" replace />}
            />
            <Route
              path="templates/interview/new"
              element={<Navigate to="/settings/interview-templates/new" replace />}
            />
            <Route path="templates/interview/:id" element={<LegacyInterviewTemplateRedirect />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="settings/interview-templates/new"
              element={<InterviewTemplateEditorPage />}
            />
            <Route
              path="settings/interview-templates/:id"
              element={<InterviewTemplateEditorPage />}
            />
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
  vi.mocked(mockApi.api.db.getInterviewTemplate).mockResolvedValue({ ok: true, data: EXISTING })
})

describe('SPEC-051 · navegación global', () => {
  // SPEC-051 · AC-17
  it('shows exactly Discoveries, Empresas, Capturas and Ajustes in the sidebar, without "Plantillas"', () => {
    renderApp('/settings')

    const sidebar = getSidebar()
    const links = within(sidebar).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Discoveries',
      'Empresas',
      'Capturas',
      'Ajustes'
    ])
    expect(within(sidebar).queryByRole('link', { name: 'Plantillas' })).not.toBeInTheDocument()
  })

  // SPEC-051 · AC-18
  it('titles the top bar "Ajustes" and marks the "Ajustes" sidebar item active under /settings/interview-templates', async () => {
    renderApp('/settings/interview-templates/new')

    expect(await screen.findByRole('heading', { name: 'Nueva plantilla' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('banner')).getByRole('heading', { name: 'Ajustes' })
    ).toBeInTheDocument()
    const ajustes = within(getSidebar()).getByRole('link', { name: 'Ajustes' })
    expect(ajustes).toHaveClass('bg-accent')
    expect(ajustes).toHaveClass('font-medium')
  })
})

describe('SPEC-051 · rutas legadas', () => {
  // SPEC-051 · AC-19
  it('redirects /templates to the interview-templates settings tab', async () => {
    renderApp('/templates')

    expect(await screen.findByRole('tab', { name: 'Plantillas de preguntas' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      within(screen.getByRole('banner')).getByRole('heading', { name: 'Ajustes' })
    ).toBeInTheDocument()
  })

  // SPEC-051 · AC-20
  it('redirects /templates/interview to the interview-templates settings tab', async () => {
    renderApp('/templates/interview')

    expect(await screen.findByRole('tab', { name: 'Plantillas de preguntas' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  // SPEC-051 · AC-21
  it('redirects /templates/interview/new to the new interview-template editor under settings', async () => {
    renderApp('/templates/interview/new')

    expect(await screen.findByRole('heading', { name: 'Nueva plantilla' })).toBeInTheDocument()
  })

  // SPEC-051 · AC-22
  it('redirects /templates/interview/{id} to the editor under settings preserving the id', async () => {
    renderApp('/templates/interview/tpl-1')

    expect(await screen.findByRole('heading', { name: 'Editar plantilla' })).toBeInTheDocument()
    expect(vi.mocked(mockApi.api.db.getInterviewTemplate)).toHaveBeenCalledWith('tpl-1')
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Plantilla base')
  })
})
