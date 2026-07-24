import React, { useState } from 'react'
import { FolderOpen, Mic, Square } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { MicSelect } from '@/components/recording/MicSelect'
import { OpenSettingsButton } from '@/components/recording/OpenSettingsButton'
import { PermissionBadges } from '@/components/recording/PermissionBadges'
import { TranscriptionStatusBadge } from '@/components/recording/transcriptionStatusBadge'
import { LevelMeter } from '@/components/spike/LevelMeter'
import { formatElapsed } from '@/lib/formatElapsed'
import { cn } from '@/lib/utils'
import type { RecordingController } from '@/hooks/useRecordingController'

interface RecordingTopBarControlsProps {
  controller: RecordingController
}

/** Clases compartidas del contenedor: horizontal, compacto y, en mobile (< md),
 *  salta a una fila propia bajo la fila título/Buscar del header. */
const CONTAINER_CLASS = 'flex flex-wrap items-center gap-4 max-md:order-last max-md:basis-full'

/**
 * Controles de grabación en la top bar, por estado del controller (SPEC-055,
 * extensión de SPEC-034 a los tres estados y a la entrevista clásica):
 * - Grabada: etiqueta «Grabada» (con la duración si el resultado está en
 *   memoria) + «Mostrar en Finder» + «Nueva grabación» (abre el diálogo de
 *   sobrescritura, montado aquí junto a su botón).
 * - Grabando: sesión en vivo — cronómetro, Detener, estado de transcripción y
 *   medidores de nivel.
 * - Preparación: permisos + «Abrir Ajustes del Sistema» (SPEC-049) + selector de
 *   micrófono compacto.
 * La condición de montaje del portal vive en las páginas de detalle (fuera del
 * detalle el slot queda vacío).
 */
export function RecordingTopBarControls({
  controller
}: RecordingTopBarControlsProps): React.ReactElement {
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  if (controller.recorded) {
    return (
      <div data-testid="topbar-recorded-controls" className={CONTAINER_CLASS}>
        <span className="text-sm text-muted-foreground">
          Grabada
          {controller.result !== null
            ? ` · ${formatElapsed(Math.round(controller.result.durationSeconds))}`
            : ''}
        </span>
        <Button variant="outline" size="sm" onClick={controller.handleShowInFinder}>
          <FolderOpen /> Mostrar en Finder
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirmOverwrite(true)}>
          <Mic /> Nueva grabación
        </Button>
        <AlertDialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sobrescribir grabación</AlertDialogTitle>
              <AlertDialogDescription>
                La grabación y transcripción actuales se sustituirán.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmOverwrite(false)
                  // Los archivos antiguos NO se borran del disco (MVP): quedan
                  // huérfanos hasta que la nueva grabación sustituya las
                  // referencias al detener (misma semántica que SPEC-015).
                  controller.requestNewRecording()
                }}
              >
                Sobrescribir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  if (controller.capturing) {
    return (
      <div data-testid="topbar-recording-controls" className={CONTAINER_CLASS}>
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
    <div data-testid="topbar-capture-controls" className={CONTAINER_CLASS}>
      <PermissionBadges permissions={controller.permissions} />
      {/* SPEC-049: acción correctiva junto a los badges, solo con algún
          permiso no concedido */}
      <OpenSettingsButton permissions={controller.permissions} />
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
