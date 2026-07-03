import type { AudioLevels } from '@/types/audio'
import {
  createRecorderWorkletUrl,
  DEFAULT_BATCH_FRAMES,
  RECORDER_WORKLET_NAME
} from '@/worklets/recorderProcessor'

export const CAPTURE_SAMPLE_RATE = 16000

const ANALYSER_FFT_SIZE = 2048
const LEVEL_SCALE = 400
const STOP_FLUSH_TIMEOUT_MS = 1000

/**
 * Monta el grafo de audio de la captura dual y transmite los lotes PCM al main
 * en streaming (memoria plana):
 *
 *   mic ──────────┬─ analyser (medidor L)
 *                 └─ merger[0] ─┐
 *   sistema ──────┬─ analyser   ├─ worklet ─(Int16 intercalado)→ IPC → disco
 *                 └─ merger[1] ─┘
 */
export class WavRecorderService {
  private context: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private merger: ChannelMergerNode | null = null
  private micAnalyser: AnalyserNode | null = null
  private systemAnalyser: AnalyserNode | null = null
  private readonly analysisBuffer = new Float32Array(ANALYSER_FFT_SIZE)
  private samples = 0

  get samplesWritten(): number {
    return this.samples
  }

  get durationSeconds(): number {
    return this.samples / CAPTURE_SAMPLE_RATE
  }

  async start(micStream: MediaStream | null, systemStream: MediaStream | null): Promise<void> {
    if (this.context !== null) {
      throw new Error('El recorder ya está iniciado')
    }
    this.samples = 0
    const context = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE })
    this.context = context

    const workletUrl = createRecorderWorkletUrl()
    try {
      await context.audioWorklet.addModule(workletUrl)
    } finally {
      URL.revokeObjectURL(workletUrl)
    }

    const merger = context.createChannelMerger(2)
    this.merger = merger

    if (micStream !== null && micStream.getAudioTracks().length > 0) {
      const source = context.createMediaStreamSource(micStream)
      const analyser = context.createAnalyser()
      analyser.fftSize = ANALYSER_FFT_SIZE
      source.connect(analyser)
      source.connect(merger, 0, 0)
      this.micAnalyser = analyser
    }

    if (systemStream !== null && systemStream.getAudioTracks().length > 0) {
      const audioOnly = new MediaStream(systemStream.getAudioTracks())
      const source = context.createMediaStreamSource(audioOnly)
      const analyser = context.createAnalyser()
      analyser.fftSize = ANALYSER_FFT_SIZE
      source.connect(analyser)
      source.connect(merger, 0, 1)
      this.systemAnalyser = analyser
    }

    const workletNode = new AudioWorkletNode(context, RECORDER_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      processorOptions: { batchFrames: DEFAULT_BATCH_FRAMES }
    })
    workletNode.port.onmessage = (event: MessageEvent): void => {
      if (event.data instanceof ArrayBuffer) {
        this.samples += event.data.byteLength / 4
        window.api.recording.writeChunk(event.data)
      }
    }
    merger.connect(workletNode)
    // El worklet no emite señal (salida en silencio), pero debe estar conectado
    // a destination para que el grafo lo procese.
    workletNode.connect(context.destination)
    this.workletNode = workletNode
  }

  private readLevel(analyser: AnalyserNode | null): number {
    if (analyser === null) {
      return 0
    }
    analyser.getFloatTimeDomainData(this.analysisBuffer)
    let sum = 0
    for (let i = 0; i < this.analysisBuffer.length; i++) {
      sum += this.analysisBuffer[i] * this.analysisBuffer[i]
    }
    const rms = Math.sqrt(sum / this.analysisBuffer.length)
    return Math.min(100, Math.round(rms * LEVEL_SCALE))
  }

  getLevels(): AudioLevels {
    return {
      microphone: this.readLevel(this.micAnalyser),
      system: this.readLevel(this.systemAnalyser)
    }
  }

  /** Pide flush al worklet, espera confirmación y desmonta el grafo. */
  async stop(): Promise<void> {
    const { context, workletNode } = this
    if (context === null || workletNode === null) {
      return
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, STOP_FLUSH_TIMEOUT_MS)
      const previous = workletNode.port.onmessage
      workletNode.port.onmessage = (event: MessageEvent): void => {
        if (event.data === 'stopped') {
          clearTimeout(timer)
          resolve()
          return
        }
        if (previous !== null) {
          previous.call(workletNode.port, event)
        }
      }
      workletNode.port.postMessage('stop')
    })
    this.merger?.disconnect()
    workletNode.disconnect()
    await context.close()
    this.context = null
    this.workletNode = null
    this.merger = null
    this.micAnalyser = null
    this.systemAnalyser = null
  }
}
