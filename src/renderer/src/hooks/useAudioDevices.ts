import { useCallback, useEffect, useState } from 'react'
import type { AudioInputDevice } from '@/types/audio'
import { DEFAULT_DEVICE_ID, listAudioInputDevices } from '@/services/captureService'

export interface UseAudioDevicesResult {
  devices: AudioInputDevice[]
  selectedDeviceId: string
  setSelectedDeviceId: (deviceId: string) => void
}

/**
 * Dispositivos de entrada disponibles + selección. Se re-enumera con el evento
 * devicechange; si el dispositivo seleccionado desaparece, vuelve al default.
 */
export function useAudioDevices(): UseAudioDevicesResult {
  const [devices, setDevices] = useState<AudioInputDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(DEFAULT_DEVICE_ID)

  const load = useCallback(async (): Promise<void> => {
    try {
      const found = await listAudioInputDevices()
      setDevices(found)
      setSelectedDeviceId((current) =>
        found.some((device) => device.deviceId === current) ? current : DEFAULT_DEVICE_ID
      )
    } catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    // Diferido para no hacer setState síncrono dentro del cuerpo del efecto
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    const onChange = (): void => {
      void load()
    }
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return (): void => {
      window.clearTimeout(timer)
      navigator.mediaDevices.removeEventListener('devicechange', onChange)
    }
  }, [load])

  return { devices, selectedDeviceId, setSelectedDeviceId }
}
