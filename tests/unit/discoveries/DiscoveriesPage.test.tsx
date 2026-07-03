/**
 * Tests de la sección Discoveries (SPEC-010, AC-01..AC-14 y AC-18). Frontera
 * de mocking: api.db del bridge. Rutas reales en MemoryRouter (listado +
 * detalle) con Toaster para los toasts de mutación.
 * Notas del dev aplicadas: los dialogs de renombrar/eliminar se abren con
 * setTimeout(0) desde el menú → findBy*; el form es real (Enter = submit);
 * durante un dialog modal Radix pone body pointer-events:none (normal).
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DiscoveriesPage } from '@/pages/DiscoveriesPage'
import { DiscoveryDetailPage } from '@/pages/DiscoveryDetailPage'
import type { Discovery } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

function discovery(id: string, name: string, createdAt: string, updatedAt: string): Discovery {
  return { id, name, createdAt, updatedAt }
}

const OLD_DISCOVERY = discovery(
  'd-old',
  'Discovery antiguo',
  '2026-07-01T12:00:00.000Z',
  '2026-07-01T12:00:00.000Z'
)
const RECENT_DISCOVERY = discovery(
  'd-new',
  'Discovery reciente',
  '2026-07-03T12:00:00.000Z',
  '2026-07-04T09:00:00.000Z'
)

function setDiscoveries(discoveries: Discovery[]): void {
  vi.mocked(mockApi.api.db.listDiscoveries).mockResolvedValue({ ok: true, data: discoveries })
}

function renderAt(initialEntry: string): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/discoveries" element={<DiscoveriesPage />} />
          <Route path="/discoveries/:id" element={<DiscoveryDetailPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/** Abre el dialog de creación desde "Nuevo discovery" y devuelve su input. */
async function openCreateDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'Nuevo discovery' }))
  await screen.findByRole('dialog')
  return screen.getByLabelText('Nombre')
}

/** Abre una acción del menú ⋯ de la primera fila (los dialogs abren con setTimeout(0)). */
async function openRowAction(
  user: ReturnType<typeof userEvent.setup>,
  action: 'Renombrar' | 'Eliminar'
): Promise<void> {
  await user.click((await screen.findAllByRole('button', { name: 'Acciones' }))[0])
  await user.click(await screen.findByRole('menuitem', { name: action }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  setDiscoveries([])
})

describe('DiscoveriesPage', () => {
  describe('listing', () => {
    // SPEC-010 · AC-01
    it('renders each row with the clickable name, its creation date and the actions menu button', async () => {
      setDiscoveries([OLD_DISCOVERY])
      renderAt('/discoveries')

      const nameLink = await screen.findByRole('link', { name: 'Discovery antiguo' })
      expect(nameLink).toHaveAttribute('href', '/discoveries/d-old')
      const expectedDate = new Date(OLD_DISCOVERY.createdAt).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
      expect(screen.getByText(`Creado el ${expectedDate}`)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Acciones' })).toBeInTheDocument()
    })

    // SPEC-010 · AC-02
    it('orders the discoveries by updatedAt descending (most recent first)', async () => {
      // Fixture a propósito desordenado: el más antiguo primero
      setDiscoveries([OLD_DISCOVERY, RECENT_DISCOVERY])
      renderAt('/discoveries')

      await screen.findByRole('link', { name: 'Discovery antiguo' })
      const links = screen.getAllByRole('link')
      expect(links.map((link) => link.textContent)).toEqual([
        'Discovery reciente',
        'Discovery antiguo'
      ])
    })

    // SPEC-010 · AC-03
    it('shows the empty state with the "Crear primer discovery" CTA when there are none', async () => {
      renderAt('/discoveries')

      expect(await screen.findByText('Aún no hay discoveries')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear primer discovery' })).toBeInTheDocument()
    })

    // SPEC-010 · AC-04
    it('shows skeletons while the list is loading', async () => {
      vi.mocked(mockApi.api.db.listDiscoveries).mockReturnValue(new Promise<never>(() => undefined))
      const { container } = renderAt('/discoveries')

      await screen.findByRole('button', { name: 'Nuevo discovery' })
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
      expect(screen.queryByText('Aún no hay discoveries')).not.toBeInTheDocument()
    })

    // SPEC-010 · AC-05
    it('shows the error state with the message and a "Reintentar" button that reloads', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.listDiscoveries)
        .mockResolvedValueOnce({
          ok: false,
          error: { kind: 'storage', message: 'Fallo simulado al listar' }
        })
        .mockResolvedValueOnce({ ok: true, data: [] })
      renderAt('/discoveries')

      expect(await screen.findByText('Fallo simulado al listar')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Reintentar' }))

      expect(vi.mocked(mockApi.api.db.listDiscoveries)).toHaveBeenCalledTimes(2)
      expect(await screen.findByText('Aún no hay discoveries')).toBeInTheDocument()
    })
  })

  describe('creation', () => {
    // SPEC-010 · AC-06
    it('opens the "Nuevo discovery" dialog with the focus on the Nombre field', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries')

      const input = await openCreateDialog(user)

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Nuevo discovery' })).toBeInTheDocument()
      expect(input).toHaveAttribute('placeholder', 'Discovery de Maurya')
      expect(document.activeElement).toBe(input)
    })

    // SPEC-010 · AC-07 (envío con click en "Crear")
    it('creates on "Crear" click, closes the dialog, shows the toast and lists the new discovery on top', async () => {
      const user = userEvent.setup()
      setDiscoveries([OLD_DISCOVERY])
      vi.mocked(mockApi.api.db.createDiscovery).mockResolvedValue({
        ok: true,
        data: RECENT_DISCOVERY
      })
      renderAt('/discoveries')

      const input = await openCreateDialog(user)
      await user.type(input, 'Discovery reciente')
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      expect(vi.mocked(mockApi.api.db.createDiscovery)).toHaveBeenCalledWith({
        name: 'Discovery reciente'
      })
      const toasts = await screen.findAllByText('Discovery creado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      // El nuevo (updatedAt más reciente) queda arriba
      const links = screen.getAllByRole('link')
      expect(links[0]).toHaveTextContent('Discovery reciente')
    })

    // SPEC-010 · AC-07 (envío con Enter: el form es real)
    it('creates on Enter as well, closing the dialog', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.db.createDiscovery).mockResolvedValue({
        ok: true,
        data: RECENT_DISCOVERY
      })
      renderAt('/discoveries')

      const input = await openCreateDialog(user)
      await user.type(input, 'Discovery reciente{Enter}')

      expect(vi.mocked(mockApi.api.db.createDiscovery)).toHaveBeenCalledWith({
        name: 'Discovery reciente'
      })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    // SPEC-010 · AC-08
    it('shows the inline "Campo requerido" error for empty or whitespace-only names without calling the bridge', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries')

      const input = await openCreateDialog(user)
      await user.click(screen.getByRole('button', { name: 'Crear' }))
      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()

      // Solo espacios tampoco vale
      await user.type(input, '   ')
      await user.click(screen.getByRole('button', { name: 'Crear' }))
      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.createDiscovery)).not.toHaveBeenCalled()
    })

    // SPEC-010 · AC-09
    it('closes the dialog without creating anything on Cancelar and on Escape', async () => {
      const user = userEvent.setup()
      renderAt('/discoveries')

      // Cancelar
      let input = await openCreateDialog(user)
      await user.type(input, 'No debe crearse')
      await user.click(screen.getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      // Escape
      input = await openCreateDialog(user)
      await user.type(input, 'Tampoco debe crearse')
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      expect(vi.mocked(mockApi.api.db.createDiscovery)).not.toHaveBeenCalled()
    })
  })

  describe('renaming', () => {
    // SPEC-010 · AC-10
    it('opens the "Renombrar discovery" dialog with the current name preloaded and selected', async () => {
      const user = userEvent.setup()
      setDiscoveries([OLD_DISCOVERY])
      renderAt('/discoveries')

      await openRowAction(user, 'Renombrar')

      const dialog = await screen.findByRole('dialog')
      expect(
        within(dialog).getByRole('heading', { name: 'Renombrar discovery' })
      ).toBeInTheDocument()
      const input = screen.getByLabelText('Nombre') as HTMLInputElement
      expect(input).toHaveValue('Discovery antiguo')
      expect(document.activeElement).toBe(input)
      // Texto seleccionado por completo (se puede sobrescribir tecleando)
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe('Discovery antiguo'.length)
    })

    // SPEC-010 · AC-11
    it('renames on "Guardar", shows the toast and updates the list', async () => {
      const user = userEvent.setup()
      setDiscoveries([OLD_DISCOVERY])
      vi.mocked(mockApi.api.db.updateDiscovery).mockResolvedValue({
        ok: true,
        data: {
          ...OLD_DISCOVERY,
          name: 'Discovery renombrado',
          updatedAt: '2026-07-04T10:00:00.000Z'
        }
      })
      renderAt('/discoveries')

      await openRowAction(user, 'Renombrar')
      const input = (await screen.findByLabelText('Nombre')) as HTMLInputElement
      await user.clear(input)
      await user.type(input, 'Discovery renombrado')
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.db.updateDiscovery)).toHaveBeenCalledWith('d-old', {
        name: 'Discovery renombrado'
      })
      const toasts = await screen.findAllByText('Discovery renombrado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByRole('link', { name: 'Discovery renombrado' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Discovery antiguo' })).not.toBeInTheDocument()
    })

    // SPEC-010 · AC-12
    it('shows the inline "Campo requerido" error when renaming to empty without calling the bridge', async () => {
      const user = userEvent.setup()
      setDiscoveries([OLD_DISCOVERY])
      renderAt('/discoveries')

      await openRowAction(user, 'Renombrar')
      const input = await screen.findByLabelText('Nombre')
      await user.clear(input)
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText('Campo requerido')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.updateDiscovery)).not.toHaveBeenCalled()
    })
  })

  describe('deletion', () => {
    // SPEC-010 · AC-13
    it('opens the "Eliminar discovery" AlertDialog warning about the full cascade with the name', async () => {
      const user = userEvent.setup()
      setDiscoveries([OLD_DISCOVERY])
      renderAt('/discoveries')

      await openRowAction(user, 'Eliminar')

      const dialog = await screen.findByRole('alertdialog')
      expect(
        within(dialog).getByRole('heading', { name: 'Eliminar discovery' })
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          /Se eliminarán permanentemente «Discovery antiguo» y todas sus empresas, contactos, entrevistas y notas\./
        )
      ).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.db.deleteDiscovery)).not.toHaveBeenCalled()
    })

    // SPEC-010 · AC-14
    it('removes the row and shows the "Discovery eliminado" toast after confirming', async () => {
      const user = userEvent.setup()
      setDiscoveries([OLD_DISCOVERY, RECENT_DISCOVERY])
      vi.mocked(mockApi.api.db.deleteDiscovery).mockResolvedValue({ ok: true, data: null })
      renderAt('/discoveries')

      // Primera fila = el más reciente (orden updatedAt desc)
      await openRowAction(user, 'Eliminar')
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

      expect(vi.mocked(mockApi.api.db.deleteDiscovery)).toHaveBeenCalledWith('d-new')
      const toasts = await screen.findAllByText('Discovery eliminado')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByRole('link', { name: 'Discovery reciente' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Discovery antiguo' })).toBeInTheDocument()
    })
  })

  describe('mutation errors', () => {
    // SPEC-010 · AC-18
    it('shows an error toast, keeps the dialog open and leaves the list untouched when the bridge fails', async () => {
      const user = userEvent.setup()
      setDiscoveries([OLD_DISCOVERY])
      vi.mocked(mockApi.api.db.createDiscovery).mockResolvedValue({
        ok: false,
        error: { kind: 'storage', message: 'Fallo simulado al crear' }
      })
      renderAt('/discoveries')

      const input = await openCreateDialog(user)
      await user.type(input, 'Discovery fallido')
      await user.click(screen.getByRole('button', { name: 'Crear' }))

      const toasts = await screen.findAllByText('Fallo simulado al crear')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // El Dialog sigue abierto y el listado no cambió. Ojo: con el dialog
      // modal abierto Radix marca el fondo aria-hidden → roles con hidden:true
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getAllByRole('link', { hidden: true })).toHaveLength(1)
      expect(screen.getByText('Discovery antiguo')).toBeInTheDocument()
      expect(screen.queryByText('Discovery fallido')).not.toBeInTheDocument()
    })
  })
})
