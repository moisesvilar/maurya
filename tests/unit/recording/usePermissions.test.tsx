/**
 * Fix permisos micrófono: refresh on-focus del hook usePermissions.
 * El snapshot se consulta al montar (comportamiento previo, SPEC-015) y ahora
 * también cada vez que la ventana recupera el foco: el usuario vuelve de
 * conceder el permiso en Ajustes del Sistema y los badges deben reaccionar sin
 * remontar la página. Frontera de mocking: permissionsService.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePermissions } from '@/hooks/usePermissions'
import { getPermissionsStatus } from '@/services/permissionsService'
import type { PermissionsSnapshot } from '@/types/audio'

vi.mock('@/services/permissionsService', () => ({
  getPermissionsStatus: vi.fn()
}))

const DENIED: PermissionsSnapshot = { microphone: 'denied', systemAudio: 'granted' }
const GRANTED: PermissionsSnapshot = { microphone: 'granted', systemAudio: 'granted' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPermissionsStatus).mockResolvedValue(DENIED)
})

describe('usePermissions — refresh on focus', () => {
  it('re-queries the snapshot when the window regains focus', async () => {
    const { result } = renderHook(() => usePermissions())
    await waitFor(() => {
      expect(result.current.permissions).toEqual(DENIED)
    })

    // El usuario concede el permiso en Ajustes y vuelve a la app
    vi.mocked(getPermissionsStatus).mockResolvedValue(GRANTED)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(result.current.permissions).toEqual(GRANTED)
    })
  })

  it('stops listening for focus after unmounting', async () => {
    const { result, unmount } = renderHook(() => usePermissions())
    await waitFor(() => {
      expect(result.current.permissions).toEqual(DENIED)
    })
    const callsBefore = vi.mocked(getPermissionsStatus).mock.calls.length

    unmount()
    window.dispatchEvent(new Event('focus'))

    expect(vi.mocked(getPermissionsStatus).mock.calls.length).toBe(callsBefore)
  })
})
