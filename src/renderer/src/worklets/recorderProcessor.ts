/**
 * AudioWorklet processor del spike: convierte Float32 estéreo (L=mic, R=sistema)
 * a Int16 intercalado y lo emite por el port en lotes de ~8192 frames (~32 KB).
 *
 * El código del processor se define como string y se carga vía Blob URL porque
 * `audioWorklet.addModule` necesita una URL de módulo independiente y esto es
 * determinista tanto en dev como en build con electron-vite.
 */

export const RECORDER_WORKLET_NAME = 'recorder-processor'
export const DEFAULT_BATCH_FRAMES = 8192

const PROCESSOR_SOURCE = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = (options && options.processorOptions) || {}
    this.batchFrames = opts.batchFrames || ${DEFAULT_BATCH_FRAMES}
    this.buffer = new Int16Array(this.batchFrames * 2)
    this.offset = 0
    this.stopped = false
    this.port.onmessage = (event) => {
      if (event.data === 'stop') {
        this.flush()
        this.stopped = true
        this.port.postMessage('stopped')
      }
    }
  }

  flush() {
    if (this.offset > 0) {
      const out = this.buffer.slice(0, this.offset * 2)
      this.port.postMessage(out.buffer, [out.buffer])
      this.offset = 0
    }
  }

  process(inputs) {
    if (this.stopped) {
      return false
    }
    const input = inputs[0]
    if (!input || input.length === 0 || !input[0]) {
      return true
    }
    const left = input[0]
    const right = input.length > 1 && input[1] ? input[1] : null
    for (let i = 0; i < left.length; i++) {
      const l = Math.max(-1, Math.min(1, left[i]))
      const r = right ? Math.max(-1, Math.min(1, right[i])) : 0
      this.buffer[this.offset * 2] = l < 0 ? l * 0x8000 : l * 0x7fff
      this.buffer[this.offset * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7fff
      this.offset += 1
      if (this.offset >= this.batchFrames) {
        this.flush()
      }
    }
    return true
  }
}

registerProcessor('${RECORDER_WORKLET_NAME}', RecorderProcessor)
`

/** Crea una Blob URL con el módulo del processor listo para addModule. */
export function createRecorderWorkletUrl(): string {
  const blob = new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' })
  return URL.createObjectURL(blob)
}
