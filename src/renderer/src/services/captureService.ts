import type { AudioInputDevice } from '@/types/audio'

/** Valor sentinela para "micrófono por defecto del sistema" en el Select. */
export const DEFAULT_DEVICE_ID = '__default__'

/** Abre el stream del micrófono seleccionado (o el por defecto del sistema). */
export function acquireMicrophoneStream(deviceId: string | null): Promise<MediaStream> {
  const audio: MediaTrackConstraints | boolean =
    deviceId !== null && deviceId !== DEFAULT_DEVICE_ID ? { deviceId: { exact: deviceId } } : true
  return navigator.mediaDevices.getUserMedia({ audio, video: false })
}

/**
 * Abre el stream de audio del sistema. La petición getDisplayMedia se intercepta
 * en main (setDisplayMediaRequestHandler) y devuelve la pantalla primaria como
 * vídeo + audio 'loopback'. El video track debe mantenerse vivo durante la
 * captura (detenerlo puede silenciar el audio, electron#49607).
 */
export function acquireSystemAudioStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
}

/** Enumera los dispositivos de entrada de audio disponibles. */
export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({
      deviceId: device.deviceId !== '' ? device.deviceId : DEFAULT_DEVICE_ID,
      label: device.label !== '' ? device.label : `Micrófono ${index + 1}`
    }))
}

/** Detiene todas las pistas de un stream (audio y vídeo). */
export function stopStream(stream: MediaStream | null): void {
  if (stream !== null) {
    stream.getTracks().forEach((track) => track.stop())
  }
}
