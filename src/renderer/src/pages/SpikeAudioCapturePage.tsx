import React, { useCallback } from 'react'
import { toast } from 'sonner'
import { CaptureErrorAlert } from '@/components/spike/CaptureErrorAlert'
import { CaptureSection } from '@/components/spike/CaptureSection'
import { ConfigSection } from '@/components/spike/ConfigSection'
import { PermissionsSection } from '@/components/spike/PermissionsSection'
import { ResultSection } from '@/components/spike/ResultSection'
import { StopOnCloseDialog } from '@/components/spike/StopOnCloseDialog'
import { useAudioCapture } from '@/hooks/useAudioCapture'
import { useAudioDevices } from '@/hooks/useAudioDevices'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { usePermissions } from '@/hooks/usePermissions'
import type { RecordingResult } from '@/types/audio'

export function SpikeAudioCapturePage(): React.ReactElement {
  const { permissions, refresh } = usePermissions()
  const { devices, selectedDeviceId, setSelectedDeviceId } = useAudioDevices()

  const handleSaved = useCallback((saved: RecordingResult): void => {
    toast('Grabación guardada', {
      action: {
        label: 'Mostrar en Finder',
        onClick: (): void => {
          void window.api.recording.showInFinder(saved.filePath)
        }
      }
    })
  }, [])

  const { status, elapsedSeconds, levels, error, result, start, stop, clearError } =
    useAudioCapture(handleSaved)

  const { closeDialogOpen, cancelClose, confirmClose } = useCloseGuard(stop)

  const handleStart = useCallback((): void => {
    clearError()
    void start(selectedDeviceId).then(() => {
      // El intento de inicio puede haber disparado prompts TCC: refrescar Badges
      void refresh()
    })
  }, [clearError, start, selectedDeviceId, refresh])

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
      <h1 className="text-2xl font-bold">Spike — Captura de audio macOS</h1>
      {error !== null && <CaptureErrorAlert error={error} />}
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
      {result !== null && <ResultSection result={result} onShowInFinder={handleShowInFinder} />}
      <StopOnCloseDialog
        open={closeDialogOpen}
        onCancel={cancelClose}
        onConfirm={() => void confirmClose()}
      />
    </main>
  )
}
