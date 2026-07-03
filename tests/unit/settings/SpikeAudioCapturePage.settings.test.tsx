/**
 * Test de la navegación harness → Ajustes (SPEC-007): el botón de engranaje
 * (aria-label "Ajustes") solo existe si se inyecta onOpenSettings (lo hace
 * HarnessRoute en App); la página sigue montándose SIN Router.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SpikeAudioCapturePage } from '@/pages/SpikeAudioCapturePage'
import { listAudioInputDevices } from '@/services/captureService'
import { getPermissionsStatus } from '@/services/permissionsService'
import { installMockApi } from '../../helpers/mockApi'

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

beforeEach(() => {
  vi.clearAllMocks()
  installMockApi()
  vi.mocked(getPermissionsStatus).mockResolvedValue({
    microphone: 'granted',
    systemAudio: 'granted'
  })
  vi.mocked(listAudioInputDevices).mockResolvedValue([])
})

describe('SpikeAudioCapturePage (settings navigation)', () => {
  describe('when the settings handler is injected', () => {
    // SPEC-007 · AC-01
    it('calls onOpenSettings when the gear button with aria-label "Ajustes" is clicked', async () => {
      const user = userEvent.setup()
      const onOpenSettings = vi.fn()
      render(
        <TooltipProvider>
          <SpikeAudioCapturePage onOpenSettings={onOpenSettings} />
        </TooltipProvider>
      )

      await user.click(await screen.findByRole('button', { name: 'Ajustes' }))

      expect(onOpenSettings).toHaveBeenCalledTimes(1)
    })
  })
})
