/**
 * Tests de la sección Nota y del Sheet de transcripción (SPEC-017, mitad UI;
 * adaptados por SPEC-027 al editor WYSIWYG y por SPEC-029 a la edición
 * markdown por defecto: con nota, el editor está SIEMPRE montado — sin modo
 * lectura ni botón "Editar" — y la barra Guardar/Descartar solo existe con
 * cambios; los ACs propios de SPEC-029 viven en los describes "always-on
 * editing (SPEC-029)" y "header actions (SPEC-029)"), montados vía
 * InterviewDetailPage con rutas reales (mocks del spike, patrón SPEC-015/016).
 * Lecciones aplicadas: "Ver transcripción"/"Guardar" pueden colisionar con
 * otras secciones → within(section) anclado al heading "Nota" (y fixtures
 * sin guión para minimizar dobles); el Sheet de radix es un Dialog (portal +
 * fondo aria-hidden); toasts sonner duplicados → getAllBy; máx 1 hover de
 * tooltip por render. jsdom+ProseMirror: cambios vía toolbar (API TipTap);
 * documento intacto = sin onChange → dirty-check y round-trip deterministas.
 * OJO (SPEC-029): el "Regenerar" deshabilitado va envuelto en TooltipTrigger y
 * se REMONTA al habilitarse (getStatus/templates async) → esperar
 * toBeEnabled() por testid y re-consultar el elemento antes de clicar (nunca
 * clicar la referencia stale previa).
 * SPEC-027/SPEC-035 (disposición): sin nota y SIN transcripción la sección
 * Nota NO se monta — haya guión o no — y el estado vacío record-first «Graba
 * la entrevista para poder generar la nota.» (SPEC-017 · AC-02) quedó
 * derogado por SPEC-035 (rama eliminada de NoteSection); tras generar la nota
 * la sección se remonta reordenada → re-anclar el section y encadenar el mock
 * de getNoteByInterview (2 lecturas iniciales null, después la nota persistida).
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InterviewDetailPage } from '@/pages/InterviewDetailPage'
import { listAudioInputDevices } from '@/services/captureService'
import { getPermissionsStatus } from '@/services/permissionsService'
import type { Company, Interview, Note, NoteTemplate } from '@/types/domain'
import type { NoteGenerationResult } from '@/types/llm'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

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

let mockApi: MockApiHandle

const COMPANY: Company = {
  id: 'c-1',
  discoveryId: 'd-1',
  name: 'Acme Corp',
  website: null,
  linkedinUrl: null,
  createdAt: '2026-07-02T12:00:00.000Z',
  updatedAt: '2026-07-02T12:00:00.000Z'
}

const TRANSCRIPT_PATH = '/tmp/maurya-recordings/entrevista.transcript.json'

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: 'i-1',
    // SPEC-020 (schema v2): toda entrevista ancla su discovery directamente.
    discoveryId: 'd-1',
    companyId: 'c-1',
    contactId: null,
    templateId: null,
    title: 'Discovery con Acme',
    status: 'recorded',
    scriptMarkdown: null,
    objectives: [],
    wavPath: '/tmp/maurya-recordings/entrevista.wav',
    transcriptPath: TRANSCRIPT_PATH,
    createdAt: '2026-07-04T10:00:00.000Z',
    updatedAt: '2026-07-04T10:00:00.000Z',
    ...overrides
  }
}

const SUMMARIZED = interview({ status: 'summarized' })

const NOTE: Note = {
  id: 'n-1',
  interviewId: 'i-1',
  contentMarkdown: '## Dolores\n\nEl CTO gestiona todo a mano.\n\n## Citas\n\n«Nos lleva dos días»',
  createdAt: '2026-07-04T11:00:00.000Z',
  updatedAt: '2026-07-04T11:00:00.000Z'
}

const NOTE_TEMPLATE: NoteTemplate = {
  id: 'nt-1',
  name: 'Notas discovery',
  context: 'Céntrate en dolores.',
  sections: [
    { title: 'Dolores', description: 'Problemas detectados' },
    { title: 'Citas', description: 'Frases literales' }
  ],
  createdAt: '2026-07-04T09:00:00.000Z',
  updatedAt: '2026-07-04T09:00:00.000Z'
}

const GENERATION_RESULT: NoteGenerationResult = { interview: SUMMARIZED, note: NOTE }

function setInterview(value: Interview): void {
  vi.mocked(mockApi.api.db.getInterview).mockResolvedValue({ ok: true, data: value })
}

function setNote(value: Note | null): void {
  vi.mocked(mockApi.api.db.getNoteByInterview).mockResolvedValue({ ok: true, data: value })
}

function setTemplates(templates: NoteTemplate[]): void {
  vi.mocked(mockApi.api.db.listNoteTemplates).mockResolvedValue({ ok: true, data: templates })
}

function renderDetail(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/discoveries/d-1/companies/c-1/interviews/i-1']}>
        <Routes>
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

/** Sección Nota anclada a su heading (evita colisiones con Grabación/Guión). */
async function noteSection(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: 'Nota' })
  const section = heading.closest('section')
  if (section === null) {
    throw new Error('La sección Nota debe anclarse a su heading')
  }
  return section
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.getCompany).mockResolvedValue({ ok: true, data: COMPANY })
  setInterview(interview())
  setNote(null)
  setTemplates([NOTE_TEMPLATE])
  vi.mocked(mockApi.api.llm.getStatus).mockResolvedValue({
    ok: true,
    data: { hasAnthropicKey: true }
  })
  vi.mocked(listAudioInputDevices).mockResolvedValue([])
  vi.mocked(getPermissionsStatus).mockResolvedValue({
    microphone: 'granted',
    systemAudio: 'granted'
  })
})

describe('NoteSection', () => {
  describe('base states', () => {
    // SPEC-017 · AC-01
    it('shows the template selector and the "Generar nota" button for a recorded interview without note', async () => {
      renderDetail()
      const section = await noteSection()

      await waitFor(() =>
        expect(within(section).getByRole('button', { name: 'Generar nota' })).toBeEnabled()
      )
      expect(within(section).getByRole('combobox', { name: 'Note-template' })).toHaveTextContent(
        'Notas discovery'
      )
      expect(within(section).getByRole('button', { name: 'Ver transcripción' })).toBeInTheDocument()
    })

    // SPEC-017 · AC-02 DEROGADO por SPEC-035: el estado vacío «Graba la
    // entrevista para poder generar la nota.» se eliminó — sin transcripción y
    // sin nota la sección Nota ya ni se monta, ni siquiera con guión. Este es
    // el caso de SPEC-035 · AC-01 montado vía InterviewDetailPage.
    it('does not mount the Nota section nor the record-first message when there is no recording', async () => {
      setInterview(
        interview({
          transcriptPath: null,
          wavPath: null,
          status: 'draft',
          scriptMarkdown: '# Guión previo'
        })
      )
      renderDetail()

      // La página está cargada cuando la sección Guión (la única de contenido
      // que queda) aparece; a partir de ahí se aserta la ausencia total
      expect(await screen.findByRole('heading', { name: 'Guión' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Nota' })).not.toBeInTheDocument()
      expect(
        screen.queryByText('Graba la entrevista para poder generar la nota.')
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox', { name: 'Note-template' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Generar nota' })).not.toBeInTheDocument()
    })

    // SPEC-017 · AC-03
    it('shows the create-template hint with a link and disables generation with its tooltip when there are no note-templates', async () => {
      const user = userEvent.setup()
      setTemplates([])
      renderDetail()
      const section = await noteSection()

      expect(
        await within(section).findByText(/Crea un note-template para generar la nota/)
      ).toBeInTheDocument()
      expect(
        within(section).getByRole('link', { name: 'Gestionar note-templates' })
      ).toHaveAttribute('href', '/settings?tab=note-templates')

      const generateButton = within(section).getByRole('button', { name: 'Generar nota' })
      expect(generateButton).toBeDisabled()
      const wrapper = generateButton.parentElement
      if (wrapper === null) {
        throw new Error('El botón deshabilitado debe estar envuelto por el TooltipTrigger')
      }
      await user.hover(wrapper)
      expect(
        (await screen.findAllByText('Necesitas un note-template')).length
      ).toBeGreaterThanOrEqual(1)
    })

    // SPEC-017 · AC-04
    it('shows the Anthropic key alert with a link to Ajustes and disables generation when there is no key', async () => {
      vi.mocked(mockApi.api.llm.getStatus).mockResolvedValue({
        ok: true,
        data: { hasAnthropicKey: false }
      })
      renderDetail()
      const section = await noteSection()

      expect(await within(section).findByText(/para generar la nota/)).toBeInTheDocument()
      expect(within(section).getByRole('link', { name: 'Ajustes' })).toHaveAttribute(
        'href',
        '/settings'
      )
      expect(within(section).getByRole('button', { name: 'Generar nota' })).toBeDisabled()
    })
  })

  describe('generation', () => {
    // SPEC-017 · AC-06
    it('shows the disabled "Generando nota…" button while the generation is pending', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.llm.generateNote).mockReturnValue(new Promise<never>(() => undefined))
      renderDetail()
      const section = await noteSection()

      await waitFor(() =>
        expect(within(section).getByRole('button', { name: 'Generar nota' })).toBeEnabled()
      )
      await user.click(within(section).getByRole('button', { name: 'Generar nota' }))

      const loading = await within(section).findByRole('button', { name: 'Generando nota…' })
      expect(loading).toBeDisabled()
    })

    // SPEC-017 · AC-07 (render adaptado por SPEC-027: '## ' es un h2 real; la
    // sección se remonta reordenada al aparecer la nota → re-anclar y encadenar
    // el mock de getNoteByInterview)
    it('flips the badge to "Resumida", toasts "Nota generada" and shows the note on success', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.getNoteByInterview)
        .mockResolvedValueOnce({ ok: true, data: null })
        .mockResolvedValueOnce({ ok: true, data: null })
        .mockResolvedValue({ ok: true, data: NOTE })
      vi.mocked(mockApi.api.llm.generateNote).mockResolvedValue({
        ok: true,
        data: GENERATION_RESULT
      })
      renderDetail()
      const section = await noteSection()

      await waitFor(() =>
        expect(within(section).getByRole('button', { name: 'Generar nota' })).toBeEnabled()
      )
      await user.click(within(section).getByRole('button', { name: 'Generar nota' }))

      expect(vi.mocked(mockApi.api.llm.generateNote)).toHaveBeenCalledWith('i-1', 'nt-1')
      const toasts = await screen.findAllByText('Nota generada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByText('Resumida')).toBeInTheDocument()
      // La nota aparece con sus headings de sección renderizados (h2 reales)
      const sectionAfter = await noteSection()
      expect(
        await within(sectionAfter).findByRole('heading', { name: 'Dolores', level: 2 })
      ).toBeInTheDocument()
      expect(within(sectionAfter).getByText('El CTO gestiona todo a mano.')).toBeInTheDocument()
    })

    // SPEC-017 · AC-08 (botón unificado "Regenerar" por SPEC-029; el disabled
    // envuelto en tooltip se remonta al habilitarse → esperar y re-consultar)
    it('opens the "Regenerar nota" AlertDialog warning that edits will be replaced, with Cancelar and Regenerar', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      renderDetail()
      const section = await noteSection()

      await waitFor(() =>
        expect(within(section).getByTestId('note-regenerate-button')).toBeEnabled()
      )
      await user.click(within(section).getByTestId('note-regenerate-button'))

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Regenerar nota' })).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          'La nota actual, incluidas tus ediciones, se sustituirá por una nueva.'
        )
      ).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Regenerar' })).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      expect(vi.mocked(mockApi.api.llm.generateNote)).not.toHaveBeenCalled()
    })

    // SPEC-017 · AC-09 (botón unificado "Regenerar" por SPEC-029; el contenido
    // regenerado se muestra en el editor, no en un modo lectura)
    it('regenerates on confirm replacing the note and toasting "Nota generada"', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      const regenerated: Note = { ...NOTE, contentMarkdown: '## Dolores\n\nContenido regenerado' }
      vi.mocked(mockApi.api.llm.generateNote).mockResolvedValue({
        ok: true,
        data: { interview: SUMMARIZED, note: regenerated }
      })
      renderDetail()
      const section = await noteSection()

      await waitFor(() =>
        expect(within(section).getByTestId('note-regenerate-button')).toBeEnabled()
      )
      await user.click(within(section).getByTestId('note-regenerate-button'))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Regenerar' }))

      expect(vi.mocked(mockApi.api.llm.generateNote)).toHaveBeenCalledWith('i-1', 'nt-1')
      const toasts = await screen.findAllByText('Nota generada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await within(section).findByText('Contenido regenerado')).toBeInTheDocument()
      expect(within(section).queryByText('El CTO gestiona todo a mano.')).not.toBeInTheDocument()
    })

    // SPEC-017 · AC-10 (botón unificado "Regenerar" por SPEC-029; la nota
    // previa queda intacta en el editor siempre montado)
    it('shows a destructive alert with the mapped message and keeps interview and previous note intact on LLM error', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      vi.mocked(mockApi.api.llm.generateNote).mockResolvedValue({
        ok: false,
        error: {
          kind: 'auth',
          message: 'La clave de Anthropic no es válida. Revísala en Ajustes.'
        }
      })
      renderDetail()
      const section = await noteSection()

      await waitFor(() =>
        expect(within(section).getByTestId('note-regenerate-button')).toBeEnabled()
      )
      await user.click(within(section).getByTestId('note-regenerate-button'))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Regenerar' }))

      expect(
        await within(section).findByText('La clave de Anthropic no es válida. Revísala en Ajustes.')
      ).toBeInTheDocument()
      // Nota previa y estado intactos
      expect(within(section).getByText('El CTO gestiona todo a mano.')).toBeInTheDocument()
      expect(screen.getByText('Resumida')).toBeInTheDocument()
      expect(screen.queryAllByText('Nota generada')).toHaveLength(0)
    })
  })

  describe('always-on editing (SPEC-029)', () => {
    const EDITED = '### Dolores\n\nEl CTO gestiona todo a mano.\n\n## Citas\n\n«Nos lleva dos días»'

    // SPEC-029 · AC-01 (deroga SPEC-017 · AC-11/AC-12 y SPEC-027 · AC-22: sin
    // modo lectura ni botón "Editar"; el editor está siempre montado y la
    // barra Guardar/Descartar no existe sin cambios)
    it('shows the WYSIWYG editor directly with the note content, without Editar and without the Guardar/Descartar bar', async () => {
      setInterview(SUMMARIZED)
      setNote(NOTE)
      renderDetail()
      const section = await noteSection()

      const editor = await within(section).findByTestId('note-markdown-editor')
      const area = within(editor).getByLabelText('Nota')
      expect(area).toHaveAttribute('contenteditable', 'true')
      expect(within(area).getByText('Dolores').closest('h2')).not.toBeNull()
      expect(within(area).getByText('El CTO gestiona todo a mano.')).toBeInTheDocument()
      expect(within(editor).getByRole('toolbar', { name: 'Formato' })).toBeInTheDocument()
      expect(within(section).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
      expect(within(section).queryByTestId('note-editor-actions')).not.toBeInTheDocument()
      expect(within(section).queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
      expect(within(section).queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument()
    })

    // SPEC-029 · AC-02
    it('shows the Guardar (default) and Descartar (outline) bar when the user makes a real edit', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      renderDetail()
      const section = await noteSection()

      const editor = await within(section).findByTestId('note-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))

      const actions = await within(section).findByTestId('note-editor-actions')
      expect(within(actions).getByRole('button', { name: 'Guardar' })).toHaveAttribute(
        'data-variant',
        'default'
      )
      expect(within(actions).getByRole('button', { name: 'Descartar' })).toHaveAttribute(
        'data-variant',
        'outline'
      )
    })

    // SPEC-029 · AC-03 (y absorbe la intención del round-trip semántico de
    // SPEC-027 · AC-24: sin diferencias con lo persistido no hay barra)
    it('hides the Guardar/Descartar bar when the edit is undone back to the persisted content', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      renderDetail()
      const section = await noteSection()

      const editor = await within(section).findByTestId('note-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await within(section).findByTestId('note-editor-actions')

      // Deshacer: el primer bloque vuelve a Encabezado 2 → el markdown
      // serializado iguala el persistido y la barra desaparece
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 2' }))
      await waitFor(() =>
        expect(within(section).queryByTestId('note-editor-actions')).not.toBeInTheDocument()
      )
    })

    // SPEC-029 · AC-04 (+ SPEC-017 · AC-13 y SPEC-027 · AC-23 adaptados: ya no
    // hay modo lectura al que volver — el editor sigue montado con lo guardado)
    it('persists on Guardar, toasts "Nota guardada" and hides the bar keeping the editor mounted with the saved content', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      vi.mocked(mockApi.api.db.updateNote).mockResolvedValue({
        ok: true,
        data: { ...NOTE, contentMarkdown: EDITED }
      })
      renderDetail()
      const section = await noteSection()

      // Cambio real vía toolbar: el primer bloque (h2 Dolores) pasa a Encabezado 3
      const editor = await within(section).findByTestId('note-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await user.click(await within(section).findByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.updateNote)).toHaveBeenCalledWith('n-1', {
        contentMarkdown: EDITED
      })
      const toasts = await screen.findAllByText('Nota guardada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      await waitFor(() =>
        expect(within(section).queryByTestId('note-editor-actions')).not.toBeInTheDocument()
      )
      // El editor sigue montado con el contenido guardado (Dolores como h3)
      const editorAfter = within(section).getByTestId('note-markdown-editor')
      expect(within(editorAfter).getByText('Dolores').closest('h3')).not.toBeNull()
    })

    // SPEC-029 · AC-05 (+ SPEC-017 · AC-14 y SPEC-027 · AC-25 adaptados: el
    // descarte confirmado remonta el editor con el contenido persistido)
    it('opens the "Descartar cambios" AlertDialog on Descartar and restores the persisted content on confirm', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      renderDetail()
      const section = await noteSection()

      const editor = await within(section).findByTestId('note-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      const actions = await within(section).findByTestId('note-editor-actions')
      await user.click(within(actions).getByRole('button', { name: 'Descartar' }))

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Descartar cambios' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
      const confirm = within(dialog).getByRole('button', { name: 'Descartar' })
      expect(confirm).toHaveAttribute('data-variant', 'destructive')
      await user.click(confirm)

      await waitFor(() =>
        expect(within(section).queryByTestId('note-editor-actions')).not.toBeInTheDocument()
      )
      // El editor se remonta con el contenido persistido (Dolores vuelve a h2)
      const editorAfter = within(section).getByTestId('note-markdown-editor')
      expect(within(editorAfter).getByText('Dolores').closest('h2')).not.toBeNull()
      expect(within(editorAfter).getByText('Dolores').closest('h3')).toBeNull()
      expect(vi.mocked(mockApi.api.db.updateNote)).not.toHaveBeenCalled()
    })

    // SPEC-029 · AC-06 (+ SPEC-027 · AC-28 adaptado)
    it('toasts the storage error and keeps the changes with the bar visible when saving fails', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      vi.mocked(mockApi.api.db.updateNote).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'No se pudo escribir la base de datos' }
      })
      renderDetail()
      const section = await noteSection()

      const editor = await within(section).findByTestId('note-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await user.click(await within(section).findByRole('button', { name: 'Guardar' }))

      const toasts = await screen.findAllByText('No se pudo escribir la base de datos')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // El editor conserva el cambio (Dolores pasó a h3) y la barra sigue
      const editorStill = within(section).getByTestId('note-markdown-editor')
      expect(within(editorStill).getByText('Dolores').closest('h3')).not.toBeNull()
      expect(within(section).getByTestId('note-editor-actions')).toBeInTheDocument()
    })

    // SPEC-017 · AC-16 (adaptado por SPEC-029: la edición ya no pasa por "Editar")
    it('saves only contentMarkdown so the interview status stays "Resumida"', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      vi.mocked(mockApi.api.db.updateNote).mockResolvedValue({
        ok: true,
        data: { ...NOTE, contentMarkdown: EDITED }
      })
      renderDetail()
      const section = await noteSection()

      const editor = await within(section).findByTestId('note-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await user.click(await within(section).findByRole('button', { name: 'Guardar' }))

      await waitFor(() => expect(vi.mocked(mockApi.api.db.updateNote)).toHaveBeenCalledTimes(1))
      // La edición usa updateNote (nunca updateInterview): el estado no cambia
      const payload = vi.mocked(mockApi.api.db.updateNote).mock.calls[0][1]
      expect(Object.keys(payload)).toEqual(['contentMarkdown'])
      expect(vi.mocked(mockApi.api.db.updateInterview)).not.toHaveBeenCalled()
      expect(screen.getByText('Resumida')).toBeInTheDocument()
    })
  })

  describe('header actions (SPEC-029)', () => {
    // SPEC-029 · AC-07 (cabecera persistente: Exportar, Ver transcripción y el
    // "Regenerar" unificado — outline + RefreshCw — visibles también con cambios)
    it('keeps Exportar, Ver transcripción and the unified outline "Regenerar" visible while there are unsaved changes', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      renderDetail()
      const section = await noteSection()

      // Siempre visibles sin cambios…
      const editor = await within(section).findByTestId('note-markdown-editor')
      expect(within(section).getByRole('button', { name: 'Exportar' })).toBeInTheDocument()
      expect(within(section).getByRole('button', { name: 'Ver transcripción' })).toBeInTheDocument()
      const regenerate = within(section).getByTestId('note-regenerate-button')
      expect(regenerate).toHaveTextContent('Regenerar')
      expect(regenerate).toHaveAttribute('data-variant', 'outline')
      expect(regenerate.querySelector('svg.lucide-refresh-cw')).not.toBeNull()

      // …y también con cambios sin guardar
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await within(section).findByTestId('note-editor-actions')
      expect(within(section).getByRole('button', { name: 'Exportar' })).toBeInTheDocument()
      expect(within(section).getByRole('button', { name: 'Ver transcripción' })).toBeInTheDocument()
      expect(within(section).getByTestId('note-regenerate-button')).toBeInTheDocument()
    })

    // SPEC-029 · AC-08
    it('replaces the editor content and clears the bar when regenerating with unsaved changes', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      const regenerated: Note = { ...NOTE, contentMarkdown: '## Dolores\n\nContenido regenerado' }
      vi.mocked(mockApi.api.llm.generateNote).mockResolvedValue({
        ok: true,
        data: { interview: SUMMARIZED, note: regenerated }
      })
      renderDetail()
      const section = await noteSection()

      // Cambios sin guardar → barra visible
      const editor = await within(section).findByTestId('note-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await within(section).findByTestId('note-editor-actions')

      // Regenerar (elemento fresco tras habilitarse) y confirmar
      await waitFor(() =>
        expect(within(section).getByTestId('note-regenerate-button')).toBeEnabled()
      )
      await user.click(within(section).getByTestId('note-regenerate-button'))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Regenerar' }))

      // La nota regenerada sustituye el contenido del editor y la barra se va
      expect(await within(section).findByText('Contenido regenerado')).toBeInTheDocument()
      expect(within(section).queryByText('El CTO gestiona todo a mano.')).not.toBeInTheDocument()
      await waitFor(() =>
        expect(within(section).queryByTestId('note-editor-actions')).not.toBeInTheDocument()
      )
    })
  })

  describe('wysiwyg (SPEC-027)', () => {
    const RICH_NOTE: Note = {
      ...NOTE,
      contentMarkdown:
        '## Dolores\n\n### Detalle\n\nTexto con **negrita** y *cursiva*.\n\n- primer dolor\n- segundo dolor'
    }

    // SPEC-027 · AC-20 (adaptado por SPEC-029: el render enriquecido vive en
    // el editor siempre montado — ya no existe la vista de lectura)
    it('renders the note as fully rich markdown: headings of any level, bold, italics and lists', async () => {
      setInterview(SUMMARIZED)
      setNote(RICH_NOTE)
      renderDetail()
      const section = await noteSection()

      const editor = await within(section).findByTestId('note-markdown-editor')
      const area = within(editor).getByLabelText('Nota')
      expect(within(area).getByRole('heading', { name: 'Dolores', level: 2 })).toBeInTheDocument()
      expect(within(area).getByRole('heading', { name: 'Detalle', level: 3 })).toBeInTheDocument()
      expect(within(area).getByText('negrita').closest('strong')).not.toBeNull()
      expect(within(area).getByText('cursiva').closest('em')).not.toBeNull()
      const items = within(area).getAllByRole('listitem')
      expect(items.map((item) => item.textContent)).toEqual(['primer dolor', 'segundo dolor'])
      // Sin sintaxis markdown en crudo
      expect(area.textContent).not.toContain('#')
      expect(area.textContent).not.toContain('**')
    })

    // SPEC-027 · AC-24 DEROGADO por construcción (SPEC-029): sin tocar el
    // editor no hay botón "Guardar". La intención (round-trip sin
    // normalización espuria) queda cubierta por SPEC-029 · AC-01 (sin barra al
    // montar) y AC-03 (deshacer hasta igualar el persistido oculta la barra).

    // SPEC-027 · AC-27 (vaciado vía atajos de ProseMirror: Ctrl+A + Backspace;
    // adaptado por SPEC-029: la barra aparece al vaciar, sin paso por "Editar")
    it('saves an empty note without errors when the editor is fully cleared', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      vi.mocked(mockApi.api.db.updateNote).mockResolvedValue({
        ok: true,
        data: { ...NOTE, contentMarkdown: '' }
      })
      renderDetail()
      const section = await noteSection()

      const editor = await within(section).findByTestId('note-markdown-editor')
      within(editor).getByLabelText('Nota').focus()
      await user.keyboard('{Control>}a{/Control}{Backspace}')
      await waitFor(() =>
        expect(within(editor).queryByText('El CTO gestiona todo a mano.')).not.toBeInTheDocument()
      )
      await user.click(await within(section).findByRole('button', { name: 'Guardar' }))

      await waitFor(() => expect(vi.mocked(mockApi.api.db.updateNote)).toHaveBeenCalledTimes(1))
      const payload = vi.mocked(mockApi.api.db.updateNote).mock.calls[0][1]
      expect(String(payload.contentMarkdown ?? 'MISSING').trim()).toBe('')
      const toasts = await screen.findAllByText('Nota guardada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })

    // SPEC-027 · AC-28: absorbido por SPEC-029 · AC-06 en el describe
    // "always-on editing (SPEC-029)" (mismo escenario, sin paso por "Editar").

    // SPEC-027 · AC-29 (mitad UI: la equivalencia del fichero exportado con lo
    // persistido la garantiza el export de main de SPEC-017, que vuelca
    // contentMarkdown tal cual; adaptado por SPEC-029: tras guardar el editor
    // permanece — se espera a que desaparezca la barra, no al modo lectura)
    it('exports the note through the same export path after a WYSIWYG edit was saved', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      const edited =
        '### Dolores\n\nEl CTO gestiona todo a mano.\n\n## Citas\n\n«Nos lleva dos días»'
      vi.mocked(mockApi.api.db.updateNote).mockResolvedValue({
        ok: true,
        data: { ...NOTE, contentMarkdown: edited }
      })
      renderDetail()
      const section = await noteSection()

      const editor = await within(section).findByTestId('note-markdown-editor')
      await user.click(within(editor).getByRole('button', { name: 'Encabezado 3' }))
      await user.click(await within(section).findByRole('button', { name: 'Guardar' }))
      await waitFor(() =>
        expect(within(section).queryByTestId('note-editor-actions')).not.toBeInTheDocument()
      )

      await user.click(within(section).getByRole('button', { name: 'Exportar' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Exportar nota (.md)' }))

      expect(vi.mocked(mockApi.api.notes.export)).toHaveBeenCalledWith('i-1', 'note')
      const toasts = await screen.findAllByText('Nota exportada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('transcript sheet', () => {
    // SPEC-017 · AC-17
    it('opens the read-only transcript sheet with speaker-labelled lines', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.recording.getTranscriptLines).mockResolvedValue({
        ok: true,
        lines: [
          {
            channel: 'mic',
            text: '¿Cómo gestionáis hoy el registro?',
            startMs: 0,
            endMs: 1000,
            receivedAtMs: 1100,
            speaker: 0
          },
          {
            channel: 'system',
            text: 'Todo a mano, nos lleva dos días.',
            startMs: 1000,
            endMs: 2000,
            receivedAtMs: 2100,
            speaker: 1
          }
        ]
      })
      renderDetail()
      const section = await noteSection()

      await user.click(await within(section).findByRole('button', { name: 'Ver transcripción' }))

      // El Sheet de radix es un Dialog (portal + fondo aria-hidden)
      const sheet = await screen.findByRole('dialog')
      expect(within(sheet).getByText('Transcripción')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.recording.getTranscriptLines)).toHaveBeenCalledWith(
        TRANSCRIPT_PATH
      )
      expect(await within(sheet).findByText('Tú')).toBeInTheDocument()
      expect(within(sheet).getByText('Interlocutor 2')).toBeInTheDocument()
      expect(within(sheet).getByText('¿Cómo gestionáis hoy el registro?')).toBeInTheDocument()
      expect(within(sheet).getByText('Todo a mano, nos lleva dos días.')).toBeInTheDocument()
    })

    // SPEC-017 · AC-18 (UI)
    it('shows the unreadable-transcript error inside the sheet without breaking the page', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.recording.getTranscriptLines).mockResolvedValue({
        ok: false,
        kind: 'unreadable',
        message: 'No se pudo leer la transcripción'
      })
      renderDetail()
      const section = await noteSection()

      await user.click(await within(section).findByRole('button', { name: 'Ver transcripción' }))

      const sheet = await screen.findByRole('dialog')
      expect(await within(sheet).findByText('No se pudo leer la transcripción')).toBeInTheDocument()
      // La página sigue viva detrás (fondo aria-hidden, no roto)
      expect(screen.getByRole('heading', { name: 'Nota', hidden: true })).toBeInTheDocument()
    })
  })

  describe('export', () => {
    // SPEC-017 · AC-19
    it('exports the note from the Exportar menu and toasts "Nota exportada"', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      renderDetail()
      const section = await noteSection()

      await user.click(await within(section).findByRole('button', { name: 'Exportar' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Exportar nota (.md)' }))

      expect(vi.mocked(mockApi.api.notes.export)).toHaveBeenCalledWith('i-1', 'note')
      const toasts = await screen.findAllByText('Nota exportada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })

    // SPEC-017 · AC-20
    it('exports the transcript from the Exportar menu and toasts "Transcripción exportada"', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      renderDetail()
      const section = await noteSection()

      await user.click(await within(section).findByRole('button', { name: 'Exportar' }))
      await user.click(
        await screen.findByRole('menuitem', { name: 'Exportar transcripción (.md)' })
      )

      expect(vi.mocked(mockApi.api.notes.export)).toHaveBeenCalledWith('i-1', 'transcript')
      const toasts = await screen.findAllByText('Transcripción exportada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })

    // SPEC-017 · AC-21
    it('shows no toast when the save dialog is cancelled (neutral outcome)', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      vi.mocked(mockApi.api.notes.export).mockResolvedValue({
        ok: true,
        data: { saved: false, filePath: null }
      })
      renderDetail()
      const section = await noteSection()

      await user.click(await within(section).findByRole('button', { name: 'Exportar' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Exportar nota (.md)' }))

      await waitFor(() => expect(vi.mocked(mockApi.api.notes.export)).toHaveBeenCalledTimes(1))
      expect(screen.queryByText('Nota exportada')).not.toBeInTheDocument()
      expect(screen.queryByText('No se pudo exportar')).not.toBeInTheDocument()
    })

    // SPEC-017 · AC-22
    it('toasts the destructive "No se pudo exportar" when the export fails', async () => {
      const user = userEvent.setup()
      setInterview(SUMMARIZED)
      setNote(NOTE)
      vi.mocked(mockApi.api.notes.export).mockResolvedValue({
        ok: false,
        error: { kind: 'write', message: 'No se pudo escribir el archivo' }
      })
      renderDetail()
      const section = await noteSection()

      await user.click(await within(section).findByRole('button', { name: 'Exportar' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Exportar nota (.md)' }))

      const toasts = await screen.findAllByText('No se pudo exportar')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('interview status', () => {
    // SPEC-017 · AC-23 (STATUS_LABELS.summarized compartido con el listado)
    it('shows the "Resumida" status badge for a summarized interview', async () => {
      setInterview(SUMMARIZED)
      setNote(NOTE)
      renderDetail()

      expect(
        await screen.findByRole('heading', { name: 'Discovery con Acme', level: 1 })
      ).toBeInTheDocument()
      expect(screen.getByText('Resumida')).toBeInTheDocument()
    })
  })
})
