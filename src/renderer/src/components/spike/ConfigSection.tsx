import React from 'react'
import { MicSelect } from '@/components/recording/MicSelect'
import type { AudioInputDevice } from '@/types/audio'

interface ConfigSectionProps {
  devices: AudioInputDevice[]
  selectedDeviceId: string
  onSelectDevice: (deviceId: string) => void
  disabled: boolean
}

/**
 * Sección Configuración del harness /capture. Desde SPEC-015 es un wrapper del
 * MicSelect compartido de components/recording/ con el MISMO DOM que el
 * original.
 */
export function ConfigSection({
  devices,
  selectedDeviceId,
  onSelectDevice,
  disabled
}: ConfigSectionProps): React.ReactElement {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Configuración</h3>
      <MicSelect
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={onSelectDevice}
        disabled={disabled}
      />
    </section>
  )
}
