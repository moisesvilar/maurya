import React from 'react'
import { HashRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NoteTemplateEditorPage } from '@/pages/NoteTemplateEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SpikeAudioCapturePage } from '@/pages/SpikeAudioCapturePage'

/**
 * Wrapper de la ruta del harness (SPEC-007): el useNavigate vive AQUÍ, no en
 * SpikeAudioCapturePage, para que la página siga siendo renderizable sin
 * Router (los tests existentes la montan directamente).
 */
function HarnessRoute(): React.ReactElement {
  const navigate = useNavigate()
  return <SpikeAudioCapturePage onOpenSettings={() => void navigate('/settings')} />
}

/**
 * HashRouter (no BrowserRouter): la app empaquetada carga por file:// y las
 * rutas basadas en pathname romperían al recargar (nota técnica SPEC-007).
 */
function App(): React.ReactElement {
  return (
    <TooltipProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<HarnessRoute />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/note-templates/new" element={<NoteTemplateEditorPage />} />
          <Route path="/settings/note-templates/:id" element={<NoteTemplateEditorPage />} />
        </Routes>
      </HashRouter>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
