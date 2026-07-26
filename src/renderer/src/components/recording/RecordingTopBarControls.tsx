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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MicSelect } from '@/components/recording/MicSelect'
import { MicWorkaroundButton } from '@/components/recording/MicWorkaroundButton'
import { OpenSettingsButton } from '@/components/recording/OpenSettingsButton'
import { PermissionBadges } from '@/components/recording/PermissionBadges'
import { LevelMeter } from '@/components/spike/LevelMeter'
import { formatElapsed } from '@/lib/formatElapsed'
import { hasHardDenial } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import type { RecordingController } from '@/hooks/useRecordingController'

interface RecordingTopBarControlsProps {
  controller: RecordingController
}

/** Contenedor horizontal y compacto de la Topbar (SPEC-055-iter-1). */
const CONTAINER_CLASS = 'flex flex-wrap items-center gap-4'

const MIC_DISABLED_NO_PERMS = 'Concede los permisos de audio para elegir el micrófono'
const START_BLOCKED_REASON = 'Hay permisos de audio denegados: concédelos en Ajustes del Sistema'
const MIC_DISABLED_RECORDING = 'No se puede cambiar de dispositivo durante la captura'

/**
 * Bloque persistente de permisos (SPEC-055-iter-1): badges compactos + «Abrir
 * Ajustes» (destructive, solo si falta algún permiso). Se muestra en los tres
 * estados; su lógica de visibilidad vive en cada componente.
 */
function PermsHeader({ controller }: RecordingTopBarControlsProps): React.ReactElement {
  return (
    <>
      <PermissionBadges permissions={controller.permissions} />
      <OpenSettingsButton permissions={controller.permissions} />
      <MicWorkaroundButton permissions={controller.permissions} />
    </>
  )
}

interface IconActionProps {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'outline' | 'destructive'
  children: React.ReactNode
}

/**
 * Botón icon-only con nombre accesible (aria-label) y Tooltip al hover
 * (SPEC-055-iter-1 · AC-10). Se envuelve SIEMPRE en un span: es el trigger del
 * Tooltip (los botones disabled no emiten eventos, patrón MicSelect) y, al no
 * alternar la estructura entre enabled/disabled, el botón no se remonta al
 * habilitarse (evita el gotcha de referencia obsoleta, lección SPEC-029).
 */
function IconAction({
  label,
  onClick,
  disabled = false,
  variant = 'outline',
  children
}: IconActionProps): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant={variant}
            size="icon"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Controles de grabación de la Topbar (SPEC-055-iter-1), con estructura fija:
 * badges de permiso + «Abrir Ajustes» persistentes en los tres estados, y un
 * bloque de controles que cambia por estado del controller:
 * - Grabada: «Grabada» (sin duración) + «Mostrar en Finder» + selector +
 *   «Nueva grabación» (icon-only con tooltip; selector y «Nueva» disabled sin
 *   permisos). El diálogo «Sobrescribir grabación» se monta aquí.
 * - Grabando: selector (disabled) + cronómetro + «Detener» (icon-only) +
 *   medidores. Sin badge de estado de transcripción.
 * - Preparación: selector + «Iniciar grabación» (ambos disabled sin permisos).
 * Bloqueo por permisos (SPEC-055-iter-2) = algún permiso en denied/restricted
 * (mismo criterio que la visibilidad de «Abrir Ajustes»); pendiente no bloquea.
 */
export function RecordingTopBarControls({
  controller
}: RecordingTopBarControlsProps): React.ReactElement {
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  // SPEC-055-iter-2: solo la denegación dura (denied/restricted) bloquea las
  // acciones; con permisos pendientes (not-determined) iniciar una grabación
  // es precisamente lo que dispara los prompts TCC de macOS.
  const permsBlocked = hasHardDenial(controller.permissions)

  if (controller.recorded) {
    return (
      <div data-testid="topbar-recorded-controls" className={CONTAINER_CLASS}>
        <PermsHeader controller={controller} />
        <span className="text-sm font-medium text-muted-foreground">Grabada</span>
        <IconAction label="Mostrar en Finder" onClick={controller.handleShowInFinder}>
          <FolderOpen />
        </IconAction>
        <MicSelect
          compact
          devices={controller.devices}
          selectedDeviceId={controller.selectedDeviceId}
          onSelectDevice={controller.setSelectedDeviceId}
          disabled={permsBlocked}
          disabledReason={MIC_DISABLED_NO_PERMS}
        />
        <IconAction
          label="Nueva grabación"
          onClick={() => setConfirmOverwrite(true)}
          disabled={permsBlocked}
        >
          <Mic />
        </IconAction>
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
        <PermsHeader controller={controller} />
        <MicSelect
          compact
          devices={controller.devices}
          selectedDeviceId={controller.selectedDeviceId}
          onSelectDevice={controller.setSelectedDeviceId}
          disabled
          disabledReason={MIC_DISABLED_RECORDING}
        />
        <span
          className={cn(
            'font-mono text-xl tabular-nums',
            controller.status !== 'recording' && 'text-muted-foreground'
          )}
        >
          {formatElapsed(controller.elapsedSeconds)}
        </span>
        <IconAction
          label="Detener"
          variant="destructive"
          onClick={() => void controller.stop()}
          disabled={controller.status === 'stopping'}
        >
          <Square />
        </IconAction>
        <div className="flex items-center gap-4">
          <LevelMeter compact label="Micrófono" value={controller.levels.microphone} />
          <LevelMeter compact label="Sistema" value={controller.levels.system} />
        </div>
      </div>
    )
  }

  return (
    <div data-testid="topbar-capture-controls" className={CONTAINER_CLASS}>
      <PermsHeader controller={controller} />
      <MicSelect
        compact
        devices={controller.devices}
        selectedDeviceId={controller.selectedDeviceId}
        onSelectDevice={controller.setSelectedDeviceId}
        disabled={permsBlocked}
        disabledReason={MIC_DISABLED_NO_PERMS}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              data-testid="topbar-start-button"
              onClick={controller.handleStart}
              disabled={permsBlocked}
            >
              <Mic /> Iniciar grabación
            </Button>
          </span>
        </TooltipTrigger>
        {permsBlocked && <TooltipContent>{START_BLOCKED_REASON}</TooltipContent>}
      </Tooltip>
    </div>
  )
}
