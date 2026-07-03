/**
 * Wrapper del WebSocket de streaming de Deepgram (SPEC-002).
 * Usa el WebSocket global nativo de Node (validado en fase 0: auth por
 * subprotocolo ['token', key] funciona; no se necesita @deepgram/sdk).
 * Vive EXCLUSIVAMENTE en el main process: la key nunca cruza al renderer.
 */

const DEEPGRAM_URL =
  'wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=2&multichannel=true&interim_results=true&language=es&diarize=true'

/** Guardarraíl de backpressure: por encima se descartan chunks (el WAV no se ve afectado). */
const MAX_BUFFERED_BYTES = 1024 * 1024

/** Resultado de transcripción normalizado (un canal, una alternativa). */
export interface DeepgramResult {
  channelIndex: number
  transcript: string
  isFinal: boolean
  startSeconds: number
  durationSeconds: number
  /**
   * Hablante mayoritario del resultado según la diarización (SPEC-004),
   * 0-based; null en interims o si Deepgram no aporta dato por palabra.
   */
  speaker: number | null
}

export interface DeepgramCallbacks {
  onOpen: () => void
  onResult: (result: DeepgramResult) => void
  onClose: (code: number) => void
  onError: (message: string) => void
}

/** Palabra del mensaje `Results`; con diarize=true incluye el índice de hablante. */
interface DeepgramWord {
  speaker?: number
}

/** Subconjunto del mensaje `Results` del protocolo de Deepgram. */
interface DeepgramResultsMessage {
  type?: string
  channel_index?: number[]
  is_final?: boolean
  start?: number
  duration?: number
  channel?: {
    alternatives?: { transcript?: string; words?: DeepgramWord[] }[]
  }
}

/**
 * Hablante mayoritario de las palabras de un resultado (SPEC-004).
 * Interims → null siempre (la diarización no es estable en parciales).
 * Se ignoran las palabras sin `speaker` numérico; si no queda ninguna → null.
 * El recuento respeta el orden de aparición (Map) y el ganador exige `>`
 * estricto, así que un empate lo gana el primer hablante en aparecer.
 */
function majoritySpeaker(words: DeepgramWord[] | undefined, isFinal: boolean): number | null {
  if (!isFinal || words === undefined) {
    return null
  }
  const counts = new Map<number, number>()
  for (const word of words) {
    if (typeof word.speaker === 'number') {
      counts.set(word.speaker, (counts.get(word.speaker) ?? 0) + 1)
    }
  }
  let winner: number | null = null
  let winnerCount = 0
  for (const [speaker, count] of counts) {
    if (count > winnerCount) {
      winner = speaker
      winnerCount = count
    }
  }
  return winner
}

export class DeepgramConnection {
  private readonly ws: WebSocket
  private readonly callbacks: DeepgramCallbacks
  /** true si la conexión llegó a abrirse (distingue fallo de auth/red de una caída posterior). */
  opened = false

  constructor(apiKey: string, callbacks: DeepgramCallbacks) {
    this.callbacks = callbacks
    this.ws = new WebSocket(DEEPGRAM_URL, ['token', apiKey])
    this.ws.binaryType = 'arraybuffer'
    this.ws.onopen = (): void => {
      this.opened = true
      this.callbacks.onOpen()
    }
    this.ws.onmessage = (event): void => {
      this.handleMessage(event.data)
    }
    this.ws.onerror = (): void => {
      // El WebSocket nativo no expone detalle (fase 0: 401 => error vacío + close 1006)
      this.callbacks.onError('Error de WebSocket con Deepgram')
    }
    this.ws.onclose = (event): void => {
      this.callbacks.onClose(event.code)
    }
  }

  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN
  }

  /** Envía un chunk PCM. Devuelve false si la conexión no está abierta o hay backpressure. */
  sendAudio(chunk: Buffer): boolean {
    if (!this.isOpen || this.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      return false
    }
    this.ws.send(chunk)
    return true
  }

  sendKeepAlive(): void {
    if (this.isOpen) {
      this.ws.send(JSON.stringify({ type: 'KeepAlive' }))
    }
  }

  /** Pide a Deepgram el flush de los resultados pendientes; el servidor cierra después. */
  closeStream(): void {
    if (this.isOpen) {
      this.ws.send(JSON.stringify({ type: 'CloseStream' }))
    }
  }

  terminate(): void {
    if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
      this.ws.close()
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      return
    }
    let message: DeepgramResultsMessage
    try {
      message = JSON.parse(data) as DeepgramResultsMessage
    } catch {
      return
    }
    if (message.type !== 'Results') {
      return
    }
    const isFinal = message.is_final === true
    this.callbacks.onResult({
      channelIndex: message.channel_index?.[0] ?? 0,
      transcript: message.channel?.alternatives?.[0]?.transcript ?? '',
      isFinal,
      startSeconds: message.start ?? 0,
      durationSeconds: message.duration ?? 0,
      speaker: majoritySpeaker(message.channel?.alternatives?.[0]?.words, isFinal)
    })
  }
}

/**
 * Clasifica un fallo de conexión que nunca llegó a abrirse: el WS nativo no
 * distingue un 401 de un fallo de red (fase 0), así que se consulta el
 * endpoint de auth. Devuelve 'auth' solo ante un 401 inequívoco.
 */
export async function classifyConnectionFailure(apiKey: string): Promise<'auth' | 'other'> {
  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/token', {
      headers: { Authorization: `Token ${apiKey}` }
    })
    return response.status === 401 ? 'auth' : 'other'
  } catch {
    return 'other'
  }
}
