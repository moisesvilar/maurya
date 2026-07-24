import React from 'react'
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CaptureDetailPage } from '@/pages/CaptureDetailPage'
import { CapturesPage } from '@/pages/CapturesPage'
import { CompaniesPage } from '@/pages/CompaniesPage'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { DiscoveriesPage } from '@/pages/DiscoveriesPage'
import { DiscoveryDetailPage } from '@/pages/DiscoveryDetailPage'
import { InterviewDetailPage } from '@/pages/InterviewDetailPage'
import { InterviewGroupDetailPage } from '@/pages/InterviewGroupDetailPage'
import { InterviewTemplateEditorPage } from '@/pages/InterviewTemplateEditorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { NoteTemplateEditorPage } from '@/pages/NoteTemplateEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'

/**
 * SPEC-044: la ruta anidada legada de empresa redirige al detalle global.
 * Navigate replace: sin entrada extra en el historial del HashRouter.
 */
function LegacyCompanyRedirect(): React.ReactElement {
  const { companyId } = useParams<{ companyId: string }>()
  return <Navigate to={`/companies/${companyId ?? ''}`} replace />
}

/**
 * SPEC-051: la ruta legada del editor de plantilla de entrevista por id
 * redirige a su nuevo destino bajo Ajustes, conservando el id. Navigate
 * replace: sin entrada extra en el historial del HashRouter.
 */
function LegacyInterviewTemplateRedirect(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/settings/interview-templates/${id ?? ''}`} replace />
}

/**
 * HashRouter (no BrowserRouter): la app empaquetada carga por file:// y las
 * rutas basadas en pathname romperían al recargar (nota técnica SPEC-007).
 *
 * SPEC-009: todas las rutas viven bajo el Layout (sidebar + top bar);
 * cualquier ruta desconocida cae en la 404 dentro del propio layout.
 * SPEC-020: el index y la ruta legado /capture redirigen a /captures (Navigate
 * replace para no ensuciar el historial del HashRouter); el harness de spike
 * (SpikeAudioCapturePage) deja de estar enrutado — el código no se elimina.
 * SPEC-044: empresas globales en /companies y /companies/:companyId; la ruta
 * anidada legada bajo el discovery redirige (LegacyCompanyRedirect). La ruta
 * anidada de detalle de ENTREVISTA no se toca (la reorganiza H11.4/H11.6).
 * SPEC-051: la gestión de plantillas se unifica en Ajustes (deroga el hub
 * /templates de SPEC-009/012); el editor de plantilla de entrevista cuelga de
 * /settings/interview-templates/* y las rutas /templates* redirigen (replace).
 */
function App(): React.ReactElement {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/captures" replace />} />
              <Route path="capture" element={<Navigate to="/captures" replace />} />
              <Route path="captures" element={<CapturesPage />} />
              <Route path="captures/:id" element={<CaptureDetailPage />} />
              <Route path="discoveries" element={<DiscoveriesPage />} />
              <Route path="discoveries/:id" element={<DiscoveryDetailPage />} />
              {/* SPEC-046: detalle del grupo de entrevistas (listado + creación
                  de entrevistas con empresa global y N participantes). */}
              <Route
                path="discoveries/:discoveryId/groups/:groupId"
                element={<InterviewGroupDetailPage />}
              />
              <Route
                path="discoveries/:discoveryId/companies/:companyId"
                element={<LegacyCompanyRedirect />}
              />
              <Route
                path="discoveries/:discoveryId/companies/:companyId/interviews/:interviewId"
                element={<InterviewDetailPage />}
              />
              <Route path="companies" element={<CompaniesPage />} />
              <Route path="companies/:companyId" element={<CompanyDetailPage />} />
              {/* SPEC-051: rutas legadas /templates* → destino unificado en Ajustes (replace). */}
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
              <Route path="settings/note-templates/new" element={<NoteTemplateEditorPage />} />
              <Route path="settings/note-templates/:id" element={<NoteTemplateEditorPage />} />
              <Route
                path="settings/interview-templates/new"
                element={<InterviewTemplateEditorPage />}
              />
              <Route
                path="settings/interview-templates/:id"
                element={<InterviewTemplateEditorPage />}
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </HashRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
