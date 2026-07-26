import type { PermissionsSnapshot, PermissionState } from '@/types/audio'

/**
 * Semántica TCC ternaria (SPEC-055-iter-2): «denegado» = denied/restricted
 * (denegación dura); todo lo demás sin conceder (not-determined, unknown,
 * snapshot null) es «pendiente» — el permiso aún no se pidió y el prompt de
 * macOS se dispara al iniciar la grabación.
 */
export function isDenied(state: PermissionState | undefined): boolean {
  return state === 'denied' || state === 'restricted'
}

/** true si algún permiso del snapshot está en denegación dura. */
export function hasHardDenial(permissions: PermissionsSnapshot | null): boolean {
  return isDenied(permissions?.microphone) || isDenied(permissions?.systemAudio)
}
