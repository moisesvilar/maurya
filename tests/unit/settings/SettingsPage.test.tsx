/**
 * Tests de la página de Ajustes (SPEC-007). Frontera de mocking: el bridge
 * window.api.secrets. La página usa useNavigate → se monta en MemoryRouter
 * con una ruta probe en "/" para asertar la navegación de "Volver".
 */
import { render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsPage } from '@/pages/SettingsPage'
import type { SecretsStatus } from '@/types/secrets'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

const NOT_CONFIGURED: SecretsStatus = {
  available: true,
  deepgram: { configured: false, last4: null },
  anthropic: { configured: false, last4: null }
}

const DEEPGRAM_CONFIGURED: SecretsStatus = {
  available: true,
  deepgram: { configured: true, last4: 'abcd' },
  anthropic: { configured: false, last4: null }
}

function setStatus(status: SecretsStatus): void {
  vi.mocked(mockApi.api.secrets.getStatus).mockResolvedValue({ ok: true, data: status })
}

function renderSettings(): RenderResult {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/" element={<div>HARNESS_PROBE</div>} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </TooltipProvider>
  )
}

/** Formulario de la fila Deepgram (hay dos botones "Guardar": se acota por fila). */
async function findDeepgramForm(): Promise<{ input: HTMLElement; form: HTMLElement }> {
  const input = await screen.findByLabelText('Deepgram (transcripción)')
  const form = input.closest('form')
  if (form === null) {
    throw new Error('El input de Deepgram debe vivir dentro de su formulario de fila')
  }
  return { input, form }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  setStatus(NOT_CONFIGURED)
})

// SPEC-009 derogó el back button "Volver" de Ajustes (regla 2.3: la navegación
// la da el sidebar) → el test de SPEC-007 AC-02 se eliminó; la navegación se
// cubre ahora en tests/unit/layout (regresión de contrato, no bug).
describe('SettingsPage', () => {
  describe('saving a key', () => {
    // SPEC-007 · AC-03 (mitad UI)
    it('shows the "Clave de Deepgram guardada" toast and the "Configurada ····abcd" status after a successful save', async () => {
      const user = userEvent.setup()
      vi.mocked(mockApi.api.secrets.save).mockResolvedValue({
        ok: true,
        data: { configured: true, last4: 'abcd' }
      })
      renderSettings()

      const { input, form } = await findDeepgramForm()
      await user.type(input, 'sk-deepgram-secreta-abcd')
      await user.click(within(form).getByRole('button', { name: 'Guardar' }))

      expect(vi.mocked(mockApi.api.secrets.save)).toHaveBeenCalledWith(
        'deepgram',
        'sk-deepgram-secreta-abcd'
      )
      // sonner puede duplicar nodos del toast: query tolerante
      const toasts = await screen.findAllByText('Clave de Deepgram guardada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      expect(await screen.findByText('Configurada')).toBeInTheDocument()
      expect(screen.getByText('····abcd')).toBeInTheDocument()
      // Tras guardar, el input se limpia (write-only)
      expect(input).toHaveValue('')
    })

    // SPEC-007 · AC-06
    it('represents a configured key with badge and last4 while keeping the input empty (the key is never re-shown)', async () => {
      setStatus(DEEPGRAM_CONFIGURED)
      renderSettings()

      expect(await screen.findByText('Configurada')).toBeInTheDocument()
      expect(screen.getByText('····abcd')).toBeInTheDocument()
      const { input } = await findDeepgramForm()
      expect(input).toHaveValue('')
      expect(input).toHaveAttribute('type', 'password')
    })

    // SPEC-007 · AC-12
    it('shows the inline "Introduce una clave" error without calling the bridge when the field is empty', async () => {
      const user = userEvent.setup()
      renderSettings()

      const { form } = await findDeepgramForm()
      await user.click(within(form).getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText('Introduce una clave')).toBeInTheDocument()
      expect(vi.mocked(mockApi.api.secrets.save)).not.toHaveBeenCalled()
    })
  })

  describe('removing a key', () => {
    // SPEC-007 · AC-10
    it('opens the "Eliminar clave" AlertDialog explaining the consequence, with Cancelar and Eliminar actions', async () => {
      const user = userEvent.setup()
      setStatus(DEEPGRAM_CONFIGURED)
      renderSettings()

      await user.click(await screen.findByRole('button', { name: 'Eliminar' }))

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByRole('heading', { name: 'Eliminar clave' })).toBeInTheDocument()
      expect(within(dialog).getByText(/dejará de\s+funcionar/)).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()

      // Cancelar cierra sin tocar el almacén
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      expect(vi.mocked(mockApi.api.secrets.remove)).not.toHaveBeenCalled()
    })

    // SPEC-007 · AC-11 (mitad UI)
    it('confirming Eliminar calls remove, shows the "Clave eliminada" toast and flips the badge to "No configurada"', async () => {
      const user = userEvent.setup()
      setStatus(DEEPGRAM_CONFIGURED)
      vi.mocked(mockApi.api.secrets.remove).mockResolvedValue({
        ok: true,
        data: { configured: false, last4: null }
      })
      renderSettings()

      await user.click(await screen.findByRole('button', { name: 'Eliminar' }))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

      expect(vi.mocked(mockApi.api.secrets.remove)).toHaveBeenCalledWith('deepgram')
      const toasts = await screen.findAllByText('Clave eliminada')
      expect(toasts.length).toBeGreaterThanOrEqual(1)
      // Ambas filas quedan "No configurada" (Deepgram acaba de perder su clave)
      expect(await screen.findAllByText('No configurada')).toHaveLength(2)
      expect(screen.queryByText('····abcd')).not.toBeInTheDocument()
    })
  })

  describe('when encryption is not available', () => {
    // SPEC-007 · AC-13 (mitad UI)
    it('shows a destructive alert and disables both Guardar buttons with an explanatory tooltip', async () => {
      const user = userEvent.setup()
      setStatus({ ...NOT_CONFIGURED, available: false })
      renderSettings()

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Cifrado no disponible')
      expect(alert).toHaveClass('text-destructive')

      // SPEC-021 añadió la card "Coste de IA" con su propio Guardar (3 en
      // total); el cifrado solo deshabilita los DOS de las filas de claves
      // (el límite de coste no es un secreto y no depende de safeStorage)
      const saveButtons = screen.getAllByRole('button', { name: 'Guardar' })
      expect(saveButtons).toHaveLength(3)
      const keyRowButtons = saveButtons.filter(
        (button) => button.closest('[data-testid="ai-cost-settings-card"]') === null
      )
      expect(keyRowButtons).toHaveLength(2)
      keyRowButtons.forEach((button) => expect(button).toBeDisabled())

      // Lección Radix: el trigger real del Tooltip es el span envolvente (tabIndex 0)
      const wrapper = keyRowButtons[0].parentElement
      if (wrapper === null) {
        throw new Error('El botón Guardar deshabilitado debe estar envuelto por el TooltipTrigger')
      }
      await user.hover(wrapper)
      const tooltips = await screen.findAllByText(
        'No es posible guardar claves de forma segura en este equipo.'
      )
      expect(tooltips.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('while the status is loading', () => {
    // SPEC-007 · AC-15
    it('shows skeletons in the key status rows (no page spinner) while getStatus is pending', async () => {
      vi.mocked(mockApi.api.secrets.getStatus).mockReturnValue(new Promise<never>(() => undefined))
      const { container } = renderSettings()

      // SPEC-009 quitó el h1 "Ajustes" (título en el top bar): ancla = tab
      await screen.findByRole('tab', { name: 'Claves de IA' })
      expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
      expect(screen.queryByText('No configurada')).not.toBeInTheDocument()
      expect(screen.queryByText('Configurada')).not.toBeInTheDocument()
    })
  })
})
