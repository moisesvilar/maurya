import React from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { DiscoveriesPage } from '@/pages/DiscoveriesPage'
import { DiscoveryDetailPage } from '@/pages/DiscoveryDetailPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { NoteTemplateEditorPage } from '@/pages/NoteTemplateEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SpikeAudioCapturePage } from '@/pages/SpikeAudioCapturePage'
import { TemplatesHubPage } from '@/pages/TemplatesHubPage'

/**
 * HashRouter (no BrowserRouter): la app empaquetada carga por file:// y las
 * rutas basadas en pathname romperían al recargar (nota técnica SPEC-007).
 *
 * SPEC-009: todas las rutas viven bajo el Layout (sidebar + top bar); el
 * index redirige a /capture (home provisional hasta H2) y cualquier ruta
 * desconocida cae en la 404 dentro del propio layout.
 */
function App(): React.ReactElement {
  return (
    <TooltipProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/capture" replace />} />
            <Route path="capture" element={<SpikeAudioCapturePage />} />
            <Route path="discoveries" element={<DiscoveriesPage />} />
            <Route path="discoveries/:id" element={<DiscoveryDetailPage />} />
            <Route
              path="discoveries/:discoveryId/companies/:companyId"
              element={<CompanyDetailPage />}
            />
            <Route path="templates" element={<TemplatesHubPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/note-templates/new" element={<NoteTemplateEditorPage />} />
            <Route path="settings/note-templates/:id" element={<NoteTemplateEditorPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
