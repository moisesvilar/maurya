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

interface MicSelectProps {
  devices: AudioInputDevice[]
  selectedDeviceId: string
  onSelectDevice: (deviceId: string) => void
  disabled: boolean
}

/**
 * Selector de micrófono con label; deshabilitado con Tooltip durante la
 * captura. Extraído de ConfigSection del spike (SPEC-015) para compartirlo con
 * la sección Grabación de la entrevista, sin cambiar el DOM de /capture.
 */
export function MicSelect({
  devices,
  selectedDeviceId,
  onSelectDevice,
  disabled
}: MicSelectProps): React.ReactElement {
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
  )
}
