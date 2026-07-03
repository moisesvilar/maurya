/**
 * Tests de ConfigSection: selector de micrófono deshabilitado durante la
 * captura con Tooltip explicativo (el trigger real del Tooltip es el div
 * envolvente, porque un trigger disabled no recibe eventos de puntero).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigSection } from '@/components/spike/ConfigSection'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AudioInputDevice } from '@/types/audio'

const DEVICES: AudioInputDevice[] = [
  { deviceId: 'mic-a', label: 'Micrófono USB A' },
  { deviceId: 'mic-b', label: 'Micrófono USB B' }
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConfigSection', () => {
  describe('when a capture is in progress (disabled)', () => {
    // SPEC-001 · AC-15
    it('disables the microphone selector and shows an explanatory tooltip on hover', async () => {
      const user = userEvent.setup()
      render(
        <TooltipProvider>
          <ConfigSection
            devices={DEVICES}
            selectedDeviceId="mic-a"
            onSelectDevice={vi.fn()}
            disabled
          />
        </TooltipProvider>
      )

      const trigger = screen.getByRole('combobox', { name: 'Micrófono' })
      expect(trigger).toBeDisabled()

      // El TooltipTrigger (asChild) es el contenedor del Select deshabilitado
      const tooltipTrigger = trigger.parentElement
      if (tooltipTrigger === null) {
        throw new Error('El Select deshabilitado debe estar envuelto por el trigger del Tooltip')
      }
      await user.hover(tooltipTrigger)

      // Radix duplica el contenido del tooltip (copia visually-hidden para a11y)
      const tooltips = await screen.findAllByText(
        'No se puede cambiar de dispositivo durante la captura'
      )
      expect(tooltips.length).toBeGreaterThanOrEqual(1)
    })
  })
})
