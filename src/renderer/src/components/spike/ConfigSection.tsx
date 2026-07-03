import React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DEFAULT_DEVICE_ID } from '@/services/captureService'
import type { AudioInputDevice } from '@/types/audio'

interface ConfigSectionProps {
  devices: AudioInputDevice[]
  selectedDeviceId: string
  onSelectDevice: (deviceId: string) => void
  disabled: boolean
}

export function ConfigSection({
  devices,
  selectedDeviceId,
  onSelectDevice,
  disabled
}: ConfigSectionProps): React.ReactElement {
  const enumerated = devices.filter((device) => device.deviceId !== DEFAULT_DEVICE_ID)

  const select = (
    <Select value={selectedDeviceId} onValueChange={onSelectDevice} disabled={disabled}>
      <SelectTrigger className="w-full" aria-label="Micrófono">
        <SelectValue placeholder="Micrófono del sistema" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_DEVICE_ID}>Micrófono del sistema (por defecto)</SelectItem>
        {enumerated.map((device) => (
          <SelectItem key={device.deviceId} value={device.deviceId}>
            {device.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Configuración</h3>
      <div className="space-y-1.5">
        <span className="text-sm">Micrófono</span>
        {disabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-full">{select}</div>
            </TooltipTrigger>
            <TooltipContent>No se puede cambiar de dispositivo durante la captura</TooltipContent>
          </Tooltip>
        ) : (
          select
        )}
      </div>
    </section>
  )
}
