import { useCallback, useEffect, useState } from 'react'
import type { PermissionsSnapshot } from '@/types/audio'
import { getPermissionsStatus } from '@/services/permissionsService'

export interface UsePermissionsResult {
  permissions: PermissionsSnapshot | null
  refresh: () => Promise<PermissionsSnapshot | null>
}

/** Estado de los permisos TCC, consultado al montar SIN disparar prompts. */
export function usePermissions(): UsePermissionsResult {
  const [permissions, setPermissions] = useState<PermissionsSnapshot | null>(null)

  const refresh = useCallback(async (): Promise<PermissionsSnapshot | null> => {
    try {
      const snapshot = await getPermissionsStatus()
      setPermissions(snapshot)
      return snapshot
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    // Diferido para no hacer setState síncrono dentro del cuerpo del efecto
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return (): void => {
      window.clearTimeout(timer)
    }
  }, [refresh])

  return { permissions, refresh }
}
