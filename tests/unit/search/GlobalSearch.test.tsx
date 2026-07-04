/**
 * Tests de la búsqueda global (SPEC-018, mitad UI): TopBar (disparador +
 * atajo ⌘K) y GlobalSearchDialog (command palette cmdk sobre Radix Dialog:
 * portal + fondo aria-hidden). El TopBar se monta FUERA de las Routes (como
 * en el Layout real) con rutas probe de destino para asertar la navegación.
 * El debounce del hook es de 150 ms con timers reales → findBy y waitFor.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import type { SearchResults } from '@/types/search'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const RESULTS: SearchResults = {
  discoveries: [{ id: 'd-1', name: 'Vertical Sanidad' }],
  companies: [
    { id: 'c-1', discoveryId: 'd-1', name: 'Acmé Córp', discoveryName: 'Vertical Sanidad' }
  ],
  contacts: [
    {
      id: 'ct-1',
      name: 'María López',
      companyId: 'c-1',
      companyDiscoveryId: 'd-1',
      companyName: 'Acmé Córp'
    }
  ],
  interviews: [
    {
      id: 'i-1',
      title: 'Entrevista de dolor',
      companyId: 'c-1',
      discoveryId: 'd-1',
      companyName: 'Acmé Córp',
      status: 'recorded'
    }
  ]
}

const EMPTY_RESULTS: SearchResults = {
  discoveries: [],
  companies: [],
  contacts: [],
  interviews: []
}

function setSearch(results: SearchResults): void {
  vi.mocked(mockApi.api.db.search).mockResolvedValue({ ok: true, data: results })
}

function renderTopBar(): RenderResult {
  return render(
    <MemoryRouter initialEntries={['/capture']}>
      <TopBar />
      <Routes>
        <Route path="/capture" element={<div>HOME_PROBE</div>} />
        <Route path="/discoveries/:discoveryId" element={<div>DISCOVERY_PROBE</div>} />
        <Route
          path="/discoveries/:discoveryId/companies/:companyId"
          element={<div>COMPANY_PROBE</div>}
        />
        <Route
          path="/discoveries/:discoveryId/companies/:companyId/interviews/:interviewId"
          element={<div>INTERVIEW_PROBE</div>}
        />
      </Routes>
    </MemoryRouter>
  )
}

/** Abre el diálogo con el botón y devuelve el input de búsqueda. */
async function openSearch(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Buscar' }))
  await screen.findByRole('dialog')
  return screen.getByPlaceholderText('Buscar…')
}

/**
 * Grupo de cmdk por su heading. OJO: los nombres de discovery/empresa se
 * repiten como CONTEXTO en otros grupos → siempre scoping por grupo, nunca
 * findByText global sobre esos nombres.
 */
async function findGroup(heading: string): Promise<HTMLElement> {
  const headingNode = await screen.findByText(heading)
  const group = headingNode.closest('[cmdk-group]')
  if (group === null) {
    throw new Error(`El heading ${heading} debe pertenecer a un grupo de cmdk`)
  }
  return group as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  setSearch(RESULTS)
})

describe('GlobalSearch', () => {
  describe('opening and closing', () => {
    // SPEC-018 · AC-01
    it('opens the search dialog focusing the input when the "Buscar" button is clicked', async () => {
      const user = userEvent.setup()
      renderTopBar()

      const input = await openSearch(user)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      await waitFor(() => expect(input).toHaveFocus())
    })

    // SPEC-018 · AC-02
    it('opens the dialog on Cmd+K and on Ctrl+K (window-level shortcut)', async () => {
      const user = userEvent.setup()
      renderTopBar()

      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    // SPEC-018 · AC-03
    it('closes on Escape without navigating', async () => {
      const user = userEvent.setup()
      renderTopBar()
      await openSearch(user)

      await user.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByText('HOME_PROBE')).toBeInTheDocument()
    })

    // SPEC-018 · AC-04
    it('reopens with an empty field after closing with text written', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)

      await user.type(input, 'acme')
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      const reopened = await openSearch(user)
      expect(reopened).toHaveValue('')
      expect(
        screen.getByText('Escribe para buscar discoveries, empresas, contactos o entrevistas.')
      ).toBeInTheDocument()
    })
  })

  describe('results', () => {
    // SPEC-018 · AC-05
    it('shows a matching discovery under the "Discoveries" group', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)

      await user.type(input, 'sanid')

      const group = await findGroup('Discoveries')
      expect(within(group).getByText('Vertical Sanidad')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.search)).toHaveBeenCalledWith('sanid')
    })

    // SPEC-018 · AC-06
    it('shows a matching company under "Empresas" with its discovery name as context', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)

      await user.type(input, 'corp')

      const group = await findGroup('Empresas')
      expect(within(group).getByText('Acmé Córp')).toBeInTheDocument()
      expect(within(group).getByText('Vertical Sanidad')).toBeInTheDocument()
    })

    // SPEC-018 · AC-07
    it('shows a matching contact under "Contactos" with its company name as context', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)

      await user.type(input, 'maría')

      const group = await findGroup('Contactos')
      expect(within(group).getByText('María López')).toBeInTheDocument()
      expect(within(group).getByText('Acmé Córp')).toBeInTheDocument()
    })

    // SPEC-018 · AC-08
    it('shows a matching interview under "Entrevistas" with company context and its status badge', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)

      await user.type(input, 'dolor')

      const group = await findGroup('Entrevistas')
      expect(within(group).getByText('Entrevista de dolor')).toBeInTheDocument()
      expect(within(group).getByText('Acmé Córp')).toBeInTheDocument()
      expect(within(group).getByText('Grabada')).toBeInTheDocument()
    })

    // SPEC-018 · AC-09
    it('renders only the groups with hits, in the fixed order', async () => {
      const user = userEvent.setup()
      setSearch({
        ...EMPTY_RESULTS,
        discoveries: RESULTS.discoveries,
        interviews: RESULTS.interviews
      })
      renderTopBar()
      const input = await openSearch(user)

      await user.type(input, 'algo')

      await screen.findByText('Vertical Sanidad')
      const headings = Array.from(document.querySelectorAll('[cmdk-group-heading]')).map(
        (node) => node.textContent
      )
      expect(headings).toEqual(['Discoveries', 'Entrevistas'])
      expect(screen.queryByText('Empresas')).not.toBeInTheDocument()
      expect(screen.queryByText('Contactos')).not.toBeInTheDocument()
    })
  })

  describe('navigation', () => {
    // SPEC-018 · AC-12
    it('navigates to the discovery detail and closes when a discovery hit is clicked', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)
      await user.type(input, 'sanid')

      const group = await findGroup('Discoveries')
      await user.click(within(group).getByText('Vertical Sanidad'))

      expect(await screen.findByText('DISCOVERY_PROBE')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // SPEC-018 · AC-13
    it('navigates to the nested company detail and closes when a company hit is clicked', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)
      await user.type(input, 'corp')

      const group = await findGroup('Empresas')
      await user.click(within(group).getByText('Acmé Córp'))

      expect(await screen.findByText('COMPANY_PROBE')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // SPEC-018 · AC-14
    it("navigates to the contact's company detail and closes when a contact hit is clicked", async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)
      await user.type(input, 'maría')

      const group = await findGroup('Contactos')
      await user.click(within(group).getByText('María López'))

      expect(await screen.findByText('COMPANY_PROBE')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // SPEC-018 · AC-15
    it('navigates to the nested interview detail and closes when an interview hit is clicked', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)
      await user.type(input, 'dolor')

      const group = await findGroup('Entrevistas')
      await user.click(within(group).getByText('Entrevista de dolor'))

      expect(await screen.findByText('INTERVIEW_PROBE')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // SPEC-018 · AC-16 (flechas + Enter dentro del input de cmdk)
    it('navigates to the arrow-selected result on Enter', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const input = await openSearch(user)
      await user.type(input, 'acmé')
      await findGroup('Discoveries')

      // cmdk selecciona el primer item (discovery); una flecha abajo mueve la
      // selección al segundo (la empresa) y Enter navega al seleccionado
      await user.keyboard('{ArrowDown}{Enter}')

      expect(await screen.findByText('COMPANY_PROBE')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('empty and error states', () => {
    // SPEC-018 · AC-17
    it('shows the initial hint and no results before typing', async () => {
      const user = userEvent.setup()
      renderTopBar()
      await openSearch(user)

      expect(
        screen.getByText('Escribe para buscar discoveries, empresas, contactos o entrevistas.')
      ).toBeInTheDocument()
      expect(screen.queryByText('Discoveries')).not.toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.search)).not.toHaveBeenCalled()
    })

    // SPEC-018 · AC-18
    it('shows the "Sin resultados" empty state for a query without matches', async () => {
      const user = userEvent.setup()
      setSearch(EMPTY_RESULTS)
      renderTopBar()
      const input = await openSearch(user)

      await user.type(input, 'nada-que-coincida')

      expect(await screen.findByText('Sin resultados')).toBeInTheDocument()
    })

    // SPEC-018 · AC-19
    it('shows "No se pudo buscar" inside the dialog when the bridge fails, without breaking the app', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.search).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'Fallo simulado' }
      })
      renderTopBar()
      const input = await openSearch(user)

      await user.type(input, 'acme')

      expect(await screen.findByText('No se pudo buscar')).toBeInTheDocument()
      // La app sigue viva detrás (fondo aria-hidden por el Dialog modal)
      expect(screen.getByText('HOME_PROBE')).toBeInTheDocument()
    })
  })
})
