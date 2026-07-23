import React from 'react'
import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MicSelect } from '@/components/recording/MicSelect'
import { PermissionBadges } from '@/components/recording/PermissionBadges'
import { TranscriptionStatusBadge } from '@/components/recording/transcriptionStatusBadge'
import { LevelMeter } from '@/components/spike/LevelMeter'
import { formatElapsed } from '@/lib/formatElapsed'
import { cn } from '@/lib/utils'
import type { RecordingController } from '@/hooks/useRecordingController'

interface CaptureTopBarControlsProps {
  controller: RecordingController
}

/**
 * Controles compactos de la captura para la top bar, por estado del controller:
 * en Preparación (SPEC-034) permisos + selector de micrófono; en Grabando la
 * sesión en vivo completa — cronómetro, Detener, estado de la transcripción y
 * medidores de nivel — para que quede visible mientras se navega por el guión
 * (antes vivía al final de la página y obligaba a hacer scroll). La condición
 * de montaje del portal vive en CaptureDetailPage (fuera de esos dos estados
 * el slot queda vacío). En mobile (< md) el contenedor salta a una fila propia
 * bajo la fila título/Buscar del header (order-last + basis-full con el
 * flex-wrap del header).
 */
export function CaptureTopBarControls({
  controller
}: CaptureTopBarControlsProps): React.ReactElement {
  if (controller.capturing) {
    return (
      <div
        data-testid="topbar-recording-controls"
        className="flex flex-wrap items-center gap-4 max-md:order-last max-md:basis-full"
      >
        <span
          className={cn(
            'font-mono text-xl tabular-nums',
            controller.status !== 'recording' && 'text-muted-foreground'
          )}
        >
          {formatElapsed(controller.elapsedSeconds)}
        </span>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void controller.stop()}
          disabled={controller.status === 'stopping'}
        >
          <Square /> Detener
        </Button>
        <TranscriptionStatusBadge status={controller.transcription.status} />
        <div className="flex items-center gap-4">
          <LevelMeter compact label="Micrófono" value={controller.levels.microphone} />
          <LevelMeter compact label="Sistema" value={controller.levels.system} />
        </div>
      </div>
    )
  }
  return (
    <div
      data-testid="topbar-capture-controls"
      className="flex flex-wrap items-center gap-4 max-md:order-last max-md:basis-full"
    >
      <PermissionBadges permissions={controller.permissions} />
      <MicSelect
        compact
        devices={controller.devices}
        selectedDeviceId={controller.selectedDeviceId}
        onSelectDevice={controller.setSelectedDeviceId}
        disabled={false}
      />
    </div>
  )
}
