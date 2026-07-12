import React from 'react'
import { MicSelect } from '@/components/recording/MicSelect'
import { PermissionBadges } from '@/components/recording/PermissionBadges'
import type { RecordingController } from '@/hooks/useRecordingController'

interface CaptureTopBarControlsProps {
  controller: RecordingController
}

/**
 * Controles compactos de preparación de la captura para la top bar (SPEC-034):
 * estado de permisos + selector de micrófono, en horizontal. Se portalan al
 * slot de la top bar solo en estado Preparación (la condición vive en
 * CaptureDetailPage). En mobile (< md) el contenedor salta a una fila propia
 * bajo la fila título/Buscar del header (order-last + basis-full con el
 * flex-wrap del header).
 */
export function CaptureTopBarControls({
  controller
}: CaptureTopBarControlsProps): React.ReactElement {
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
