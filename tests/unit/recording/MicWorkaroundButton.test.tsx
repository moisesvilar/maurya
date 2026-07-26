/**
 * Fix permisos micrófono (firma ad-hoc): botón «Workaround permisos micrófono».
 * Tests unitarios del componente MicWorkaroundButton: visibilidad (micrófono en
 * estado distinto de `granted`, incluido snapshot null — mismo criterio que el
 * caso micrófono de OpenSettingsButton), lanzamiento del `tccutil reset` en
 * Terminal y diálogo de instrucciones posterior (relanzar la app e iniciar una
 * grabación), con variante de error si Terminal no llegó a lanzarse.
 * Frontera de mocking: permissionsService (resetMicrophonePermission).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MicWorkaroundButton } from '@/components/recording/MicWorkaroundButton'
import { resetMicrophonePermission } from '@/services/permissionsService'
import type { PermissionsSnapshot } from '@/types/audio'

vi.mock('@/services/permissionsService', () => ({
  resetMicrophonePermission: vi.fn()
}))

const GRANTED: PermissionsSnapshot = { microphone: 'granted', systemAudio: 'granted' }
const MIC_DENIED: PermissionsSnapshot = { microphone: 'denied', systemAudio: 'granted' }
const MIC_GRANTED_SYSTEM_DENIED: PermissionsSnapshot = {
  microphone: 'granted',
  systemAudio: 'denied'
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resetMicrophonePermission).mockResolvedValue(true)
})

describe('MicWorkaroundButton', () => {
  it('hides the button when the microphone permission is granted, even with system audio denied', () => {
    render(<MicWorkaroundButton permissions={GRANTED} />)
    expect(screen.queryByTestId('mic-workaround-button')).not.toBeInTheDocument()

    render(<MicWorkaroundButton permissions={MIC_GRANTED_SYSTEM_DENIED} />)
    expect(screen.queryByTestId('mic-workaround-button')).not.toBeInTheDocument()
  })

  it('shows the button when the microphone permission is not granted, including a null snapshot', () => {
    const { unmount } = render(<MicWorkaroundButton permissions={MIC_DENIED} />)
    expect(screen.getByTestId('mic-workaround-button')).toHaveTextContent(
      'Workaround permisos micrófono'
    )
    unmount()

    render(<MicWorkaroundButton permissions={null} />)
    expect(screen.getByTestId('mic-workaround-button')).toBeInTheDocument()
  })

  it('launches the tccutil reset in Terminal and shows the relaunch-and-record instructions', async () => {
    const user = userEvent.setup()
    render(<MicWorkaroundButton permissions={MIC_DENIED} />)

    await user.click(screen.getByRole('button', { name: 'Workaround permisos micrófono' }))

    expect(vi.mocked(resetMicrophonePermission)).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Workaround lanzado')).toBeInTheDocument()
    const description = screen.getByText(/tccutil reset Microphone com\.maurya\.app/)
    expect(description).toHaveTextContent(/relanza Maurya/i)
    expect(description).toHaveTextContent(/inicia una grabación/i)
  })

  it('shows the manual-command fallback when Terminal could not be launched', async () => {
    vi.mocked(resetMicrophonePermission).mockResolvedValue(false)
    const user = userEvent.setup()
    render(<MicWorkaroundButton permissions={MIC_DENIED} />)

    await user.click(screen.getByRole('button', { name: 'Workaround permisos micrófono' }))

    expect(await screen.findByText('No se pudo lanzar el workaround')).toBeInTheDocument()
    expect(screen.getByText(/Ejecuta manualmente/)).toHaveTextContent(
      /tccutil reset Microphone com\.maurya\.app/
    )
  })

  it('closes the instructions dialog with the confirm button', async () => {
    const user = userEvent.setup()
    render(<MicWorkaroundButton permissions={MIC_DENIED} />)

    await user.click(screen.getByRole('button', { name: 'Workaround permisos micrófono' }))
    expect(await screen.findByText('Workaround lanzado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Entendido' }))

    expect(screen.queryByText('Workaround lanzado')).not.toBeInTheDocument()
  })
})
