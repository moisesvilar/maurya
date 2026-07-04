import { writeFileSync } from 'fs'
import type { WebContents } from 'electron'
import type {
  CaptureError,
  LatencyStats,
  TranscriptChannel,
  TranscriptLine,
  TranscriptResultEvent,
  TranscriptionStatus,
  TranscriptionStatusEvent
} from '../renderer/src/types/audio'
import type { AssistantSessionSummary } from '../renderer/src/types/assistant'
import { DeepgramConnection, classifyConnectionFailure } from './deepgramService'
import type { DeepgramResult } from './deepgramService'
import { getDecryptedSecret } from './secretsService'

/** Cola de chunks mientras la conexión abre / reintenta (~20 s de audio). */
const MAX_QUEUED_CHUNKS = 40
const KEEPALIVE_CHECK_INTERVAL_MS = 5000
/** Deepgram cierra a los 10-12 s sin datos; se envía KeepAlive si no hay audio >8 s. */
const KEEPALIVE_IDLE_MS = 8000
/** Espera máxima del flush tras CloseStream (fase 0: el cierre limpio llegó en ~2 s). */
const FLUSH_TIMEOUT_MS = 2500
const MAX_RETRIES = 1

const AUTH_ERROR: CaptureError = {
  kind: 'deepgram-auth',
  message: 'No se pudo conectar con Deepgram: clave inválida'
}

interface Session {
  sender: WebContents
  apiKey: string | null
  connection: DeepgramConnection | null
  status: TranscriptionStatus
  /** true mientras hay una (re)conexión en marcha y la cola debe retener audio. */
  awaitingOpen: boolean
  finishing: boolean
  retriesUsed: number
  lines: TranscriptLine[]
  queue: Buffer[]
  /** Epoch del primer chunk enviado tras el open vigente: base de los tiempos de Deepgram. */
  audioBaseMs: number | null
  /** Epoch del inicio de la captura, para el offset mm:ss de la UI. */
  sessionStartMs: number
  lastAudioSentAtMs: number
  keepAliveTimer: NodeJS.Timeout | null
  droppedChunks: number
  flushResolve: (() => void) | null
}

let session: Session | null = null

/**
 * Listener de líneas finales (SPEC-016): el assistantService se engancha aquí
 * para acumular material de análisis. Se invoca tras el push en handleResult,
 * SIEMPRE dentro de try/catch: el asistente jamás puede romper la transcripción.
 */
let finalLineListener: ((line: TranscriptLine) => void) | null = null

/** Registra (o retira, con null) el listener de líneas finales del asistente. */
export function setFinalLineListener(listener: ((line: TranscriptLine) => void) | null): void {
  finalLineListener = listener
}

/**
 * Resolución de la clave Deepgram (SPEC-007), re-evaluada en cada captura:
 * 1º clave de Ajustes (cifrada con safeStorage) → 2º DEEPGRAM_API_KEY de
 * .env.local (fallback de desarrollo) → 3º null (flujo 'no-key' de SPEC-002).
 */
function getApiKey(): string | null {
  const fromSettings = getDecryptedSecret('deepgram')
  if (fromSettings !== null) {
    return fromSettings
  }
  const key = process.env['DEEPGRAM_API_KEY']?.trim()
  return key !== undefined && key !== '' ? key : null
}

function emitStatus(target: Session, status: TranscriptionStatus, error?: CaptureError): void {
  target.status = status
  if (!target.sender.isDestroyed()) {
    const event: TranscriptionStatusEvent = error !== undefined ? { status, error } : { status }
    target.sender.send('transcription:status', event)
  }
}

function emitResult(target: Session, event: TranscriptResultEvent): void {
  if (!target.sender.isDestroyed()) {
    target.sender.send('transcription:result', event)
  }
}

/**
 * Inicia la sesión de transcripción acoplada a la grabación. Sin key la
 * captura continúa igualmente (degradación, no bloqueo): estado 'no-key'.
 */
export function startTranscription(sender: WebContents): void {
  if (session !== null) {
    resetTranscription()
  }
  const apiKey = getApiKey()
  session = {
    sender,
    apiKey,
    connection: null,
    status: 'inactive',
    awaitingOpen: false,
    finishing: false,
    retriesUsed: 0,
    lines: [],
    queue: [],
    audioBaseMs: null,
    sessionStartMs: Date.now(),
    lastAudioSentAtMs: Date.now(),
    keepAliveTimer: null,
    droppedChunks: 0,
    flushResolve: null
  }
  if (apiKey === null) {
    emitStatus(session, 'no-key')
    return
  }
  emitStatus(session, 'connecting')
  openConnection(session, apiKey)
}

function openConnection(target: Session, apiKey: string): void {
  target.awaitingOpen = true
  target.connection = new DeepgramConnection(apiKey, {
    onOpen: (): void => {
      if (session !== target) {
        return
      }
      target.awaitingOpen = false
      target.audioBaseMs = null
      // Drenar la cola acumulada durante la (re)conexión, en orden
      const pending = target.queue
      target.queue = []
      for (const chunk of pending) {
        sendChunk(target, chunk)
      }
      startKeepAlive(target)
      // 'active' sin error limpia el Alert de conexión en el renderer (reintento con éxito)
      emitStatus(target, 'active')
    },
    onResult: (result): void => {
      if (session === target) {
        handleResult(target, result)
      }
    },
    onClose: (code): void => {
      if (session === target) {
        handleClose(target, code)
      }
    },
    onError: (): void => {
      // El detalle real (401 vs red) se clasifica en handleClose; aquí no hay información útil
    }
  })
}

function handleResult(target: Session, result: DeepgramResult): void {
  const channel: TranscriptChannel = result.channelIndex === 1 ? 'system' : 'mic'
  if (!result.isFinal && result.transcript === '') {
    return
  }
  const baseMs = target.audioBaseMs ?? target.sessionStartMs
  const receivedAtMs = Date.now()
  const line: TranscriptLine = {
    channel,
    text: result.transcript,
    startMs: Math.round(baseMs + result.startSeconds * 1000),
    endMs: Math.round(baseMs + (result.startSeconds + result.durationSeconds) * 1000),
    receivedAtMs,
    speaker: result.speaker
  }
  if (result.isFinal && result.transcript !== '') {
    target.lines.push(line)
    // Instrumentación para el ítem 4 de H0: latencia por resultado final
    console.log(
      `[transcription] final channel=${channel} latencia=${receivedAtMs - line.endMs}ms chars=${line.text.length}`
    )
    // Tee hacia el asistente (SPEC-016): un fallo suyo nunca afecta a esto
    if (finalLineListener !== null) {
      try {
        finalLineListener(line)
      } catch {
        // el asistente es degradable; la transcripción sigue siendo la fuente de verdad
      }
    }
  }
  emitResult(target, {
    ...line,
    isFinal: result.isFinal,
    offsetSeconds: Math.max(0, (line.startMs - target.sessionStartMs) / 1000)
  })
}

function handleClose(target: Session, code: number): void {
  stopKeepAlive(target)
  if (target.finishing) {
    target.flushResolve?.()
    target.flushResolve = null
    return
  }
  const neverOpened = target.connection !== null && !target.connection.opened
  target.connection = null
  target.awaitingOpen = false
  if (target.apiKey === null) {
    return
  }
  if (neverOpened) {
    // Fase 0: con key inválida el WS nativo da error vacío + close 1006; hay que clasificar
    void classifyConnectionFailure(target.apiKey).then((failure) => {
      if (session !== target || target.finishing) {
        return
      }
      if (failure === 'auth') {
        emitStatus(target, 'disconnected', AUTH_ERROR)
        return
      }
      retryOrGiveUp(target, code)
    })
    return
  }
  retryOrGiveUp(target, code)
}

function retryOrGiveUp(target: Session, code: number): void {
  if (target.retriesUsed < MAX_RETRIES && target.apiKey !== null) {
    target.retriesUsed += 1
    emitStatus(target, 'disconnected', {
      kind: 'deepgram-connection',
      message: `Se perdió la conexión con Deepgram (código ${code}). Reintentando la conexión…`
    })
    openConnection(target, target.apiKey)
    return
  }
  emitStatus(target, 'disconnected', {
    kind: 'deepgram-connection',
    message: `No se pudo restablecer la conexión con Deepgram (código ${code}). La captura continúa sin transcripción; se conservan las líneas ya recibidas.`
  })
}

/**
 * Tee del flujo PCM: mismo chunk Int16 interleaved que va al WAV.
 * Nunca lanza hacia el caller; la transcripción jamás afecta a la grabación.
 */
export function pushAudio(chunk: Buffer): void {
  if (session === null || session.finishing) {
    return
  }
  const target = session
  if (target.connection !== null && target.connection.isOpen) {
    sendChunk(target, chunk)
    return
  }
  if (target.awaitingOpen) {
    target.queue.push(chunk)
    if (target.queue.length > MAX_QUEUED_CHUNKS) {
      target.queue.shift()
      target.droppedChunks += 1
    }
  }
}

function sendChunk(target: Session, chunk: Buffer): void {
  const sent = target.connection?.sendAudio(chunk) === true
  if (sent) {
    const now = Date.now()
    if (target.audioBaseMs === null) {
      target.audioBaseMs = now
    }
    target.lastAudioSentAtMs = now
  } else {
    target.droppedChunks += 1
  }
}

function startKeepAlive(target: Session): void {
  stopKeepAlive(target)
  target.keepAliveTimer = setInterval(() => {
    if (Date.now() - target.lastAudioSentAtMs > KEEPALIVE_IDLE_MS) {
      target.connection?.sendKeepAlive()
    }
  }, KEEPALIVE_CHECK_INTERVAL_MS)
}

function stopKeepAlive(target: Session): void {
  if (target.keepAliveTimer !== null) {
    clearInterval(target.keepAliveTimer)
    target.keepAliveTimer = null
  }
}

/**
 * Cierra el stream limpiamente (CloseStream) y espera el flush de los últimos
 * finales, con timeout. Llamar ANTES de finalizar el WAV.
 */
export async function finishTranscription(): Promise<void> {
  if (session === null) {
    return
  }
  const target = session
  target.finishing = true
  stopKeepAlive(target)
  const connection = target.connection
  if (connection !== null && connection.isOpen) {
    await new Promise<void>((resolve) => {
      let settled = false
      const settle = (): void => {
        if (!settled) {
          settled = true
          resolve()
        }
      }
      target.flushResolve = settle
      connection.closeStream()
      setTimeout(settle, FLUSH_TIMEOUT_MS)
    })
  }
  connection?.terminate()
  target.connection = null
}

/** Resultado de persistir la transcripción: ruta del JSON + estadísticas de latencia. */
export interface PersistResult {
  transcriptPath: string | null
  latency: LatencyStats | null
}

/**
 * Calcula las estadísticas de latencia STT (SPEC-003) sobre los deltas
 * `receivedAtMs − endMs` de los resultados finales de la sesión.
 *
 * Percentiles por el método **nearest-rank** sobre la lista ordenada:
 * `sorted[max(0, ceil(p/100 · n) − 1)]`. Con n par, el p50 es el elemento
 * inferior central (no se interpola). Con n = 1, p50 = p95 = max.
 *
 * @returns null si no hay líneas (sin resultados finales).
 */
export function computeLatencyStats(lines: TranscriptLine[]): LatencyStats | null {
  if (lines.length === 0) {
    return null
  }
  const sorted = lines.map((line) => line.receivedAtMs - line.endMs).sort((a, b) => a - b)
  const n = sorted.length
  const nearestRank = (p: number): number => sorted[Math.max(0, Math.ceil((p / 100) * n) - 1)]
  return {
    count: n,
    p50Ms: nearestRank(50),
    p95Ms: nearestRank(95),
    maxMs: sorted[n - 1]
  }
}

/**
 * Persiste las líneas finales como `spike-<timestamp>.transcript.json` junto
 * al WAV (forma `{ lines, latency, assistant }`, SPEC-003 + SPEC-016) y cierra
 * la sesión. `transcriptPath` y `latency` son null si no hubo resultados
 * finales (en ese caso el summary del asistente no se escribe: sin archivo).
 * `assistant` es el registro de la sesión del asistente (SPEC-016) o null si
 * no hubo asistente (sin clave, sin entrevista). Los lectores previos del
 * archivo ignoran el campo extra.
 */
export function persistTranscript(
  wavPath: string,
  assistant: AssistantSessionSummary | null = null
): PersistResult {
  if (session === null) {
    return { transcriptPath: null, latency: null }
  }
  const target = session
  emitStatus(target, 'inactive')
  session = null
  if (target.lines.length === 0) {
    return { transcriptPath: null, latency: null }
  }
  const latency = computeLatencyStats(target.lines)
  const transcriptPath = wavPath.replace(/\.wav$/, '') + '.transcript.json'
  writeFileSync(
    transcriptPath,
    JSON.stringify({ lines: target.lines, latency, assistant }, null, 2)
  )
  return { transcriptPath, latency }
}

/** Descarta la sesión sin persistir (cierre de emergencia). */
export function resetTranscription(): void {
  if (session === null) {
    return
  }
  const target = session
  session = null
  target.finishing = true
  stopKeepAlive(target)
  target.connection?.terminate()
  target.connection = null
}
