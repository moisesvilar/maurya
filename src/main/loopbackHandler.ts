import { desktopCapturer, session } from 'electron'

/**
 * Chromium feature flags que habilitan el loopback de audio de sistema en macOS.
 * Deben añadirse a la command line ANTES de `app.whenReady()`.
 *
 * - MacLoopbackAudioForScreenShare: habilita el loopback de audio en macOS.
 * - MacCatapSystemAudioLoopbackCapture: backend Core Audio taps (CATap, macOS 14.2+),
 *   preferido frente a ScreenCaptureKit por no mostrar el aviso mensual en macOS 15+.
 */
export const LOOPBACK_FEATURE_FLAGS =
  'MacLoopbackAudioForScreenShare,MacCatapSystemAudioLoopbackCapture'

/**
 * Registra el interceptor de getDisplayMedia que devuelve la pantalla primaria
 * como vídeo (obligatorio para que Chromium acepte la petición) y el audio de
 * sistema en modo loopback.
 */
export function registerLoopbackHandler(
  targetSession: Electron.Session = session.defaultSession
): void {
  targetSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          const primary = sources[0]
          if (primary === undefined) {
            callback({})
            return
          }
          callback({ video: primary, audio: 'loopback' })
        })
        .catch(() => {
          callback({})
        })
    },
    { useSystemPicker: false }
  )
}
