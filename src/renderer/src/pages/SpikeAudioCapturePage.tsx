import React, { useCallback } from 'react'
import { Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CaptureErrorAlert } from '@/components/spike/CaptureErrorAlert'
import { CaptureSection } from '@/components/spike/CaptureSection'
import { ConfigSection } from '@/components/spike/ConfigSection'
import { PermissionsSection } from '@/components/spike/PermissionsSection'
import { ResultSection } from '@/components/spike/ResultSection'
import { StopOnCloseDialog } from '@/components/spike/StopOnCloseDialog'
import { TranscriptionSection } from '@/components/spike/TranscriptionSection'
import { useAudioCapture } from '@/hooks/useAudioCapture'
import { useAudioDevices } from '@/hooks/useAudioDevices'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { usePermissions } from '@/hooks/usePermissions'
import { useTranscription } from '@/hooks/useTranscription'
import type { StopResult } from '@/types/audio'

interface SpikeAudioCapturePageProps {
  /**
   * Navegación a Ajustes (SPEC-007). Prop opcional inyectada por HarnessRoute
   * (App.tsx): esta página NO usa useNavigate para seguir siendo renderizable
   * sin Router en los tests existentes. Sin callback no se muestra el botón.
   */
  onOpenSettings?: () => void
}

export function SpikeAudioCapturePage({
  onOpenSettings
}: SpikeAudioCapturePageProps = {}): React.ReactElement {
  const { permissions, refresh } = usePermissions()
  const { devices, selectedDeviceId, setSelectedDeviceId } = useAudioDevices()

  const handleSaved = useCallback((saved: StopResult): void => {
    toast(
      saved.transcriptPath !== null ? 'Grabación y transcripción guardadas' : 'Grabación guardada',
      {
        action: {
          label: 'Mostrar en Finder',
          onClick: (): void => {
            void window.api.recording.showInFinder(saved.filePath)
          }
        }
      }
    )
  }, [])

  const { status, elapsedSeconds, levels, error, result, start, stop, clearError } =
    useAudioCapture(handleSaved)

  const {
    status: transcriptionStatus,
    lines,
    partials,
    error: transcriptionError,
    reset: resetTranscription
  } = useTranscription()

  const { closeDialogOpen, cancelClose, confirmClose } = useCloseGuard(stop)

  const handleStart = useCallback((): void => {
    clearError()
    resetTranscription()
    void start(selectedDeviceId).then(() => {
      // El intento de inicio puede haber disparado prompts TCC: refrescar Badges
      void refresh()
    })
  }, [clearError, resetTranscription, start, selectedDeviceId, refresh])

  const handleStop = useCallback((): void => {
    void stop()
  }, [stop])

  const handleShowInFinder = useCallback((): void => {
    if (result !== null) {
      void window.api.recording.showInFinder(result.filePath)
    }
  }, [result])

  const capturing = status === 'recording' || status === 'starting' || status === 'stopping'

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col gap-8 px-6 py-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Spike — Captura de audio macOS</h1>
        {onOpenSettings !== undefined && (
          <Button variant="ghost" size="icon" aria-label="Ajustes" onClick={onOpenSettings}>
            <Settings />
          </Button>
        )}
      </div>
      {error !== null && <CaptureErrorAlert error={error} />}
      {transcriptionError !== null && <CaptureErrorAlert error={transcriptionError} />}
      <PermissionsSection permissions={permissions} />
      <ConfigSection
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={setSelectedDeviceId}
        disabled={capturing}
      />
      <CaptureSection
        status={status}
        elapsedSeconds={elapsedSeconds}
        levels={levels}
        onStart={handleStart}
        onStop={handleStop}
      />
      <TranscriptionSection status={transcriptionStatus} lines={lines} partials={partials} />
      {result !== null && <ResultSection result={result} onShowInFinder={handleShowInFinder} />}
      <StopOnCloseDialog
        open={closeDialogOpen}
        onCancel={cancelClose}
        onConfirm={() => void confirmClose()}
      />
    </main>
  )
}
