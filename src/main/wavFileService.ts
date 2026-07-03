import { app } from 'electron'
import { closeSync, mkdirSync, openSync, writeSync } from 'fs'
import { join } from 'path'
import type { RecordingResult } from '../renderer/src/types/audio'

const SAMPLE_RATE = 16000
const CHANNELS = 2
const BITS_PER_SAMPLE = 16
const BYTES_PER_FRAME = (CHANNELS * BITS_PER_SAMPLE) / 8
const HEADER_SIZE = 44

interface ActiveRecording {
  fd: number
  filePath: string
  dataBytes: number
}

let active: ActiveRecording | null = null

function buildHeader(dataSize: number): Buffer {
  const header = Buffer.alloc(HEADER_SIZE)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16) // tamaño del sub-chunk fmt
  header.writeUInt16LE(1, 20) // PCM lineal
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_FRAME, 28) // byte rate
  header.writeUInt16LE(BYTES_PER_FRAME, 32) // block align
  header.writeUInt16LE(BITS_PER_SAMPLE, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataSize, 40)
  return header
}

export function isRecordingActive(): boolean {
  return active !== null
}

/**
 * Crea el WAV en userData/recordings con un header placeholder (tamaños a 0)
 * que se parchea al detener. Devuelve la ruta del archivo.
 */
export function startRecording(): string {
  if (active !== null) {
    throw new Error('Ya hay una grabación en curso')
  }
  const dir = join(app.getPath('userData'), 'recordings')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = join(dir, `spike-${stamp}.wav`)
  const fd = openSync(filePath, 'w')
  writeSync(fd, buildHeader(0))
  active = { fd, filePath, dataBytes: 0 }
  return filePath
}

/** Anexa un lote PCM Int16 intercalado (L=mic, R=sistema) al archivo. */
export function writeChunk(chunk: Buffer): void {
  if (active === null) {
    return
  }
  writeSync(active.fd, chunk)
  active.dataBytes += chunk.length
}

/** Parchea los tamaños del header, cierra el archivo y devuelve el resultado. */
export function stopRecording(): RecordingResult {
  if (active === null) {
    throw new Error('No hay grabación en curso')
  }
  const { fd, filePath, dataBytes } = active
  const header = buildHeader(dataBytes)
  writeSync(fd, header, 0, HEADER_SIZE, 0)
  closeSync(fd)
  active = null
  return {
    filePath,
    durationSeconds: dataBytes / (SAMPLE_RATE * BYTES_PER_FRAME),
    sizeBytes: HEADER_SIZE + dataBytes,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS
  }
}

/** Cierre de emergencia (error de escritura): conserva lo grabado hasta ahora. */
export function abortRecording(): RecordingResult | null {
  if (active === null) {
    return null
  }
  try {
    return stopRecording()
  } catch {
    active = null
    return null
  }
}
