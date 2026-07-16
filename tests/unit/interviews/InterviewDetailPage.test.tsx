/**
 * Tests del detalle mínimo de entrevista (SPEC-013, AC-11..AC-13). Resuelve
 * entrevista + empresa con getInterview/getCompany y los nombres de
 * contacto/template con los listados ya cargados (fallbacks "Sin contacto"/
 * "Sin template" con referencias null).
 * SPEC-030: el orden de secciones pasa a cabecera → Objetivos → Nota/Guión →
 * Grabación al final (describe 'section order').
 */
import { render, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { InterviewDetailPage } from '@/pages/InterviewDetailPage'
import type { Company, Interview } from '@/types/domain'
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

const INTERVIEW: Interview = {
  id: 'i-1',
  // SPEC-020 (schema v2): toda entrevista ancla su discovery directamente.
  discoveryId: 'd-1',
  companyId: 'c-1',
  contactIds: [],
  interviewGroupId: null,
  templateId: null,
  title: 'Discovery con Acme',
  status: 'draft',
  scriptMarkdown: null,
  objectives: [],
  wavPath: null,
  transcriptPath: null,
  createdAt: '2026-07-04T10:00:00.000Z',
  updatedAt: '2026-07-04T10:00:00.000Z'
}

function renderAt(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/discoveries/:discoveryId/companies/:companyId"
            element={<CompanyDetailPage />}
          />
          <Route
            path="/discoveries/:discoveryId/companies/:companyId/interviews/:interviewId"
            element={<InterviewDetailPage />}
          />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
  vi.mocked(mockApi.api.db.getInterview).mockResolvedValue({ ok: true, data: INTERVIEW })
})

describe('InterviewDetailPage', () => {
  describe('header and references', () => {
    // SPEC-013 · AC-11
    it('shows title, "Borrador" badge and refs with the null fallbacks, and "Volver" returns to the company', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries/d-1/companies/c-1/interviews/i-1')

      expect(
        await screen.findByRole('heading', { name: 'Discovery con Acme', level: 1 })
      ).toBeInTheDocument()
      expect(screen.getByText('Borrador')).toBeInTheDocument()
      // Referencias con fallbacks (fixture con contactId/templateId null)
      expect(screen.getByText(/Acme Corp · Sin contacto · Sin template/)).toBeInTheDocument()

      // Volver regresa al detalle de la empresa
      await user.click(screen.getByRole('button', { name: 'Volver' }))
      expect(
        await screen.findByRole('heading', { name: 'Acme Corp', level: 1 })
      ).toBeInTheDocument()
      expect(await screen.findByText('Aún no hay entrevistas')).toBeInTheDocument()
    })

    // SPEC-013 · AC-12 (derogado parcialmente por SPEC-014 AC-08: el empty
    // state del guión perdió el secundario provisional; 'Aún no hay guión'
    // sobrevive y la generación se testea en tests/unit/script)
    it('shows the Guión section with its empty state', async () => {
      renderAt('/discoveries/d-1/companies/c-1/interviews/i-1')

      await screen.findByRole('heading', { name: 'Discovery con Acme', level: 1 })
      // Asíncrono: desde SPEC-027 el heading "Guión" solo renderiza cuando
      // NoteScriptSections resuelve getNoteByInterview (Skeleton mientras)
      expect(await screen.findByRole('heading', { name: 'Guión' })).toBeInTheDocument()
      expect(await screen.findByText('Aún no hay guión')).toBeInTheDocument()
      expect(
        screen.queryByText('La generación con IA llegará en la siguiente fase')
      ).not.toBeInTheDocument()
    })
  })

  describe('section order (SPEC-030)', () => {
    // SPEC-030 · AC-01 (deroga la posición de «Grabación» fijada por
    // SPEC-015/025: los Objetivos siguen tras la cabecera; la Grabación
    // pasa al final, después de la zona Nota/Guión)
    it('renders the sections in order: header, Objetivos, Nota/Guión and Grabación last', async () => {
      renderAt('/discoveries/d-1/companies/c-1/interviews/i-1')

      const title = await screen.findByRole('heading', { name: 'Discovery con Acme', level: 1 })
      const objetivos = await screen.findByRole('heading', { name: 'Objetivos' })
      // Asíncronos (lección SPEC-029): los headings de la zona Nota/Guión solo
      // renderizan cuando NoteScriptSections resuelve getNoteByInterview —
      // findByRole SIEMPRE, nunca getByRole síncrono. "Grabación" también se
      // espera con findBy por robustez (mismo render ready).
      const guion = await screen.findByRole('heading', { name: 'Guión' })
      const grabacion = await screen.findByRole('heading', { name: 'Grabación' })

      /** a precede a b en el orden del documento. */
      const expectBefore = (a: HTMLElement, b: HTMLElement): void => {
        expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      }
      expectBefore(title, objetivos)
      expectBefore(objetivos, guion)
      expectBefore(guion, grabacion)
    })
  })

  describe('nonexistent interview', () => {
    // SPEC-013 · AC-13
    it('shows the error state with the "Volver a Discoveries" link when getInterview fails', async () => {
      vi.mocked(mockApi.api.db.getInterview).mockResolvedValue({
        ok: false,
        error: { kind: 'not-found', message: 'No existe entrevista con id i-404' }
      })
      renderAt('/discoveries/d-1/companies/c-1/interviews/i-404')

      expect(await screen.findByText('No existe entrevista con id i-404')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Volver a Discoveries' })).toHaveAttribute(
        'href',
        '/discoveries'
      )
    })
  })
})
