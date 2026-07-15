import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import type { TranscriptLine } from '../renderer/src/types/audio'
import type {
  AssistantAlarm,
  AssistantQueue,
  AssistantQueueItem,
  AssistantSessionSummary,
  AssistantSuggestion,
  AssistantUpdateEvent
} from '../renderer/src/types/assistant'
import type { AiUsage } from '../renderer/src/types/domain'
import type { LlmError } from '../renderer/src/types/llm'
import { getAnthropicKey, mapSdkError, toLlmError, LlmOperationError } from './llmService'
import { computeCostUsd, extractUsage, roundUpUsd } from './aiCost'
import { setFinalLineListener } from './transcriptionService'
import * as repository from './db/repository'
import { buildPersonaBlock } from './prompts'
import { REASON_MAX_CHARS, SUGGESTED_QUESTION_MAX_CHARS } from './prompts/defaults'

/**
 * Asistente proactivo en tiempo real (SPEC-016). Vive SOLO en main (patrón
 * llmService + transcriptionService): el SDK de Anthropic y la clave jamás
 * llegan al renderer; por IPC solo viajan eventos tipados.
 *
 * Invariantes:
 * - Solo se activa con `interviewId` (nunca en /capture). Sin clave de
 *   Anthropic queda INERTE: cero timers, cero listeners, cero llamadas.
 * - Control de coste: nunca dos llamadas simultáneas (guard inFlight),
 *   intervalo mínimo entre llamadas y solo con material nuevo suficiente.
 * - Un error de análisis NO resetea los contadores: el material acumulado
 *   provoca el reintento natural en la siguiente ventana.
 * - `stopAssistant()` es síncrono y debe llamarse ANTES de persistTranscript.
 */

// --- Constantes de control de coste (Notas técnicas; ajustables) ------------

/** Mínimo de líneas finales nuevas desde el último análisis para disparar otro. */
export const MIN_NEW_FINAL_LINES = 3
/** Intervalo mínimo entre llamadas a la API. */
export const MIN_INTERVAL_MS = 20000
/** Temporizador de respaldo: analiza con ≥1 línea nueva aunque no lleguen 3. */
export const FALLBACK_INTERVAL_MS = 45000
/** Últimos caracteres de conversación incluidos en el prompt. */
export const TRANSCRIPT_WINDOW_CHARS = 4000
/** Máximo de caracteres del guión incluidos en el prompt. */
export const SCRIPT_EXCERPT_CHARS = 6000

// Constantes del modelo (documentadas; ajustables si el humano quiere otro
// equilibrio latencia/coste). NUNCA enviar temperature/top_p/top_k ni
// budget_tokens: devuelven 400 en este modelo. cache_control SÍ está permitido.
const MODEL = 'claude-opus-4-8'
// SPEC-023: 1024 → 512. Con la salida acotada por schema (baseline ~136 tok de
// salida) queda margen ~3,7×; un JSON truncado cae en la red de seguridad
// existente (stop_reason !== 'end_turn' → error de formato → reintento natural).
const MAX_TOKENS = 512

// Topes de longitud de la salida (SPEC-023): DEBEN ser los mismos números en
// el schema y en el texto del prompt (contradicción prompt↔schema = riesgo).
// SPEC-026: viven en prompts/defaults.ts para que las reglas bloqueadas que
// muestra Ajustes nunca divergan de las que se envían.

/** Schema de structured outputs: la respuesta del análisis es SIEMPRE este JSON. */
const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    action: { type: 'string' as const, enum: ['dig_deeper', 'continue'] },
    // maxLength (SPEC-023): acota el tiempo de salida, el dominante en la latencia
    suggestedQuestion: { type: 'string' as const, maxLength: SUGGESTED_QUESTION_MAX_CHARS },
    reason: { type: 'string' as const, maxLength: REASON_MAX_CHARS },
    alarms: {
      type: 'array' as const,
      items: { type: 'string' as const, enum: ['compliment', 'generic', 'hypothetical'] }
    },
    objectivesMet: { type: 'array' as const, items: { type: 'integer' as const } },
    // SPEC-036: índices (0-based) de las preguntas en cola cuyo tema ya quedó
    // cubierto por la conversación (resolución automática de la cola)
    resolvedQueueIndexes: { type: 'array' as const, items: { type: 'integer' as const } }
  },
  required: [
    'action',
    'suggestedQuestion',
    'reason',
    'alarms',
    'objectivesMet',
    'resolvedQueueIndexes'
  ],
  additionalProperties: false
}

interface AssistantSession {
  sender: WebContents
  /** Objetivos de la entrevista (puede ser vacío: contexto recomendado, no obligatorio). */
  objectives: string[]
  /** Guión truncado a SCRIPT_EXCERPT_CHARS; null si la entrevista no tiene. */
  scriptExcerpt: string | null
  apiKey: string
  /** Buffer propio de líneas finales de la conversación. */
  lines: TranscriptLine[]
  newLinesSinceLastCall: number
  lastCallAtMs: number
  inFlight: boolean
  fallbackTimer: NodeJS.Timeout | null
  /** Cola de preguntas pendientes (SPEC-036), la más reciente primero. */
  pending: AssistantQueueItem[]
  /** Preguntas ancladas por el usuario (SPEC-036), en orden de anclado. */
  pinned: AssistantQueueItem[]
  /** Máximo de pendientes de la sesión (SPEC-036): leído UNA vez al arrancar. */
  maxPending: number
  /** Acumulativo: un objetivo marcado cubierto no vuelve a pendiente. */
  objectivesMet: Set<number>
  /** Candidatas ACEPTADAS en cola (SPEC-036): las suprimidas no cuentan. */
  suggestionCount: number
  /** Uso de IA acumulado de la SESIÓN (SPEC-021): en memoria, volcado al parar. */
  usage: AiUsage
  /** Coste persistido de la entrevista al arrancar (base de la comparación con el límite). */
  persistedBaseUsd: number
  /** Pausado por límite de coste: sin llamadas al LLM hasta "Reanudar". */
  pausedByLimit: boolean
  /** "Reanudar" pulsado: el límite ya no vuelve a pausar en esta sesión (AC). */
  limitOverridden: boolean
  /**
   * Prefijo fijo del prompt cacheado (SPEC-023): instrucciones + guión y
   * objetivos, construido UNA sola vez por sesión en startAssistant. La
   * estabilidad byte a byte entre llamadas es condición del acierto de caché:
   * nada de este prefijo depende de objectivesMet, de la cola (SPEC-036) ni
   * de Date.
   */
  systemBlocks: Anthropic.TextBlockParam[]
  /**
   * Totales de la sesión por componente (SPEC-023): el coste se recomputa
   * SIEMPRE desde aquí con las 4 tarifas — recomputar desde el inputTokens ya
   * plegado tarificaría el caché a la tarifa de entrada normal.
   */
  tokenTotals: { input: number; output: number; cacheWrite: number; cacheRead: number }
}

let session: AssistantSession | null = null

function emitUpdate(target: AssistantSession, event: AssistantUpdateEvent): void {
  if (!target.sender.isDestroyed()) {
    target.sender.send('assistant:update', event)
  }
}

function sortedObjectivesMet(target: AssistantSession): number[] {
  return Array.from(target.objectivesMet).sort((a, b) => a - b)
}

/** Cola completa para el evento (SPEC-036): copia superficial de ambos arrays. */
function buildQueuePayload(target: AssistantSession): AssistantQueue {
  return { pending: [...target.pending], pinned: [...target.pinned] }
}

/**
 * Normalización determinista para la supresión por similitud (SPEC-036):
 * minúsculas, sin diacríticos (SPEC-037: NFD + eliminación de marcas
 * combinantes, precedente de db/search.ts), puntuación fuera y espacios
 * colapsados. La igualdad exacta de SPEC-036 pasa así a ser insensible a
 * diacríticos: estrictamente más conservadora (descarta más, nunca menos).
 * Exportada para QA.
 */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// --- Similitud de preguntas (SPEC-037; constantes ajustables) ----------------

/**
 * Umbral del coeficiente de solapamiento a partir del cual dos preguntas se
 * consideran casi idénticas (SPEC-037). Documentada y ajustable por el humano
 * sin cambiar el contrato (patrón MIN_NEW_FINAL_LINES).
 */
export const SIMILARITY_THRESHOLD = 0.7

/**
 * Stopwords españolas excluidas de la comparación de similitud (SPEC-037):
 * artículos, preposiciones, conjunciones, pronombres, interrogativos y
 * muletillas temporales. Lista FIJA y determinista, sin diacríticos (se aplica
 * sobre texto ya pasado por normalizeQuestion); ampliable por el humano sin
 * cambiar el contrato.
 */
export const QUESTION_STOPWORDS: Set<string> = new Set([
  'que',
  'como',
  'cuanto',
  'cuanta',
  'cuantos',
  'cuantas',
  'quien',
  'donde',
  'cuando',
  'por',
  'para',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'o',
  'en',
  'con',
  'sin',
  'al',
  'se',
  'os',
  'esa',
  'ese',
  'eso',
  'esta',
  'este',
  'esto',
  'vosotros',
  'usted',
  'ustedes',
  'hoy',
  'ahora',
  'actualmente',
  'vez'
])

/**
 * Tokens significativos de una pregunta (SPEC-037): normaliza, tokeniza por
 * espacios, filtra stopwords y aplica la reducción singular/plural ingenua
 * (recorte de una «s» final en tokens de más de 3 caracteres, TRAS filtrar
 * stopwords: «citas»→«cita», «herramientas»→«herramienta»). Exportada para QA.
 */
export function questionSignificantTokens(text: string): Set<string> {
  const tokens = normalizeQuestion(text)
    .split(' ')
    .filter((token) => token !== '' && !QUESTION_STOPWORDS.has(token))
    .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token))
  return new Set(tokens)
}

/**
 * Similitud determinista entre dos preguntas (SPEC-037), local y sin llamadas
 * LLM (control de coste, regla SPEC-016/021):
 * 1. Igualdad de textos normalizados → similar (superconjunto de SPEC-036).
 * 2. Algún conjunto de tokens significativos vacío tras las stopwords → NO
 *    similar (la igualdad exacta ya se comprobó; salvaguarda de la spec).
 * 3. Coeficiente de solapamiento |A∩B| / min(|A|,|B|) >= SIMILARITY_THRESHOLD
 *    → casi idéntica.
 * Exportada para QA.
 */
export function areQuestionsSimilar(a: string, b: string): boolean {
  if (normalizeQuestion(a) === normalizeQuestion(b)) {
    return true
  }
  const tokensA = questionSignificantTokens(a)
  const tokensB = questionSignificantTokens(b)
  if (tokensA.size === 0 || tokensB.size === 0) {
    return false
  }
  let intersection = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1
    }
  }
  return intersection / Math.min(tokensA.size, tokensB.size) >= SIMILARITY_THRESHOLD
}

/**
 * Segunda barrera de similitud (SPEC-036, robustecida por SPEC-037): una
 * candidata igual O casi idéntica a cualquier pregunta de TODA la cola
 * (pendientes + ancladas) se descarta. Esta comprobación determinista es la
 * que garantizan los ACs; la instrucción del prompt es la primera barrera.
 */
function isSimilarToQueue(target: AssistantSession, question: string): boolean {
  return [...target.pending, ...target.pinned].some((item) =>
    areQuestionsSimilar(item.suggestedQuestion, question)
  )
}

/**
 * Activa el asistente para la grabación de una entrevista. Llamar SOLO desde
 * `recording:start` con interviewId (la asistencia no existe en /capture).
 * Sin clave de Anthropic emite 'no-key' y queda inerte (sin sesión, cero
 * llamadas). Guión y objetivos se cargan best-effort: su ausencia no bloquea.
 */
export function startAssistant(sender: WebContents, interviewId: string): void {
  if (session !== null) {
    stopAssistant()
  }
  const apiKey = getAnthropicKey()
  if (apiKey === null) {
    if (!sender.isDestroyed()) {
      const event: AssistantUpdateEvent = {
        state: 'no-key',
        queue: { pending: [], pinned: [] },
        objectivesMet: []
      }
      sender.send('assistant:update', event)
    }
    return
  }

  // Tamaño de la cola (SPEC-036): leído UNA vez por sesión (un cambio en
  // Ajustes a mitad aplica a la siguiente). Con try/catch obligatorio (patrón
  // readLimitUsd): un store ilegible → default 3, el asistente nunca se
  // bloquea por esto.
  let maxPending = 3
  try {
    maxPending = repository.getAssistantSettings().queueSize
  } catch {
    // sin dato o almacén ilegible: default 3
  }

  let objectives: string[] = []
  let scriptExcerpt: string | null = null
  let persistedBaseUsd = 0
  try {
    const interview = repository.getInterview(interviewId)
    objectives = interview.objectives
    scriptExcerpt =
      interview.scriptMarkdown !== null && interview.scriptMarkdown.trim() !== ''
        ? interview.scriptMarkdown.slice(0, SCRIPT_EXCERPT_CHARS)
        : null
    // SPEC-021: el límite compara persistido + sesión; sin dato → base 0
    persistedBaseUsd = interview.aiUsage?.estimatedCostUsd ?? 0
  } catch {
    // Entrevista ilegible: el asistente funciona igualmente sin ese contexto
  }

  const target: AssistantSession = {
    sender,
    objectives,
    scriptExcerpt,
    apiKey,
    lines: [],
    newLinesSinceLastCall: 0,
    lastCallAtMs: 0,
    inFlight: false,
    fallbackTimer: null,
    // SPEC-036: la cola es estado de sesión — nace vacía en cada grabación
    pending: [],
    pinned: [],
    maxPending,
    objectivesMet: new Set<number>(),
    suggestionCount: 0,
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    persistedBaseUsd,
    pausedByLimit: false,
    limitOverridden: false,
    // SPEC-023: el prefijo cacheado se construye AQUÍ y no se recalcula.
    // SPEC-026/031: el override del prompt se lee SOLO al arrancar la sesión
    // (un cambio en Ajustes a mitad aplica a la siguiente sesión) y llega ya
    // envuelto con salvaguarda + delimitadores estáticos (byte-estable).
    systemBlocks: buildSystemBlocks(objectives, scriptExcerpt, buildPersonaBlock('assistant')),
    tokenTotals: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  }
  session = target
  setFinalLineListener((line) => {
    handleFinalLine(target, line)
  })
  target.fallbackTimer = setInterval(() => {
    if (session === target) {
      maybeAnalyze(target, 1)
    }
  }, FALLBACK_INTERVAL_MS)
  emitUpdate(target, { state: 'idle', queue: buildQueuePayload(target), objectivesMet: [] })
}

function handleFinalLine(target: AssistantSession, line: TranscriptLine): void {
  if (session !== target) {
    return
  }
  target.lines.push(line)
  target.newLinesSinceLastCall += 1
  maybeAnalyze(target, MIN_NEW_FINAL_LINES)
}

/**
 * Límite de coste configurado (SPEC-021), leído en cada evaluación. Con
 * try/catch obligatorio: un store no inicializado o ilegible se comporta como
 * "sin límite" — el asistente conserva su invariante de degradabilidad.
 */
function readLimitUsd(): number | null {
  try {
    return repository.getAiCostSettings().limitUsd
  } catch {
    return null
  }
}

/**
 * Evalúa los disparadores del análisis (control de coste): guard in-flight,
 * material nuevo mínimo (`minLines`: 3 por línea, 1 desde el respaldo) e
 * intervalo mínimo entre llamadas. Sin material nuevo → sin llamada.
 * El gate de límite de coste (SPEC-021) va DESPUÉS de los disparadores de
 * SPEC-016 (que no se modifican) y justo antes de lanzar el análisis.
 */
function maybeAnalyze(target: AssistantSession, minLines: number): void {
  if (target.inFlight) {
    return
  }
  if (target.newLinesSinceLastCall < minLines) {
    return
  }
  if (Date.now() - target.lastCallAtMs < MIN_INTERVAL_MS) {
    return
  }
  // Límite de coste (SPEC-021): persistido + sesión, redondeado hacia arriba
  // para pausar ANTES de excederlo. "Reanudar" lo desactiva para la sesión.
  if (!target.limitOverridden) {
    const limitUsd = readLimitUsd()
    if (
      limitUsd !== null &&
      roundUpUsd(target.persistedBaseUsd + target.usage.estimatedCostUsd) >= limitUsd
    ) {
      if (!target.pausedByLimit) {
        target.pausedByLimit = true
        const event: AssistantUpdateEvent = {
          state: 'paused',
          queue: buildQueuePayload(target),
          objectivesMet: sortedObjectivesMet(target),
          pauseLimitUsd: limitUsd
        }
        if (target.usage.calls > 0) {
          event.usage = { ...target.usage }
        }
        emitUpdate(target, event)
      }
      return
    }
  }
  void runAnalysis(target)
}

async function runAnalysis(target: AssistantSession): Promise<void> {
  target.inFlight = true
  // La ventana de frecuencia cuenta desde el inicio de la llamada, también si
  // falla: ante error se "reintenta en la siguiente ventana", no en cascada.
  target.lastCallAtMs = Date.now()
  const linesAtCall = target.newLinesSinceLastCall
  // Snapshot de la cola tal como viaja en el prompt (SPEC-036): los índices de
  // resolvedQueueIndexes se resuelven contra este snapshot de ids, no contra
  // la cola viva (anclar/desanclar en vuelo desplaza los índices vivos).
  const queueSnapshot: AssistantQueueItem[] = [...target.pending, ...target.pinned]
  const pendingSnapshotCount = target.pending.length
  // 'analyzing' viaja con la cola completa: el renderer la conserva visible.
  // El usage acompaña solo con ≥1 análisis para que la línea no parpadee.
  const analyzingEvent: AssistantUpdateEvent = {
    state: 'analyzing',
    queue: buildQueuePayload(target),
    objectivesMet: sortedObjectivesMet(target)
  }
  if (target.usage.calls > 0) {
    analyzingEvent.usage = { ...target.usage }
  }
  emitUpdate(target, analyzingEvent)
  try {
    const outcome = await requestSuggestion(target)
    if (session !== target) {
      return // respuesta tardía tras stop: se descarta
    }
    target.newLinesSinceLastCall -= linesAtCall
    // 1. Resolución automática (SPEC-036): solo el tramo PENDIENTE del
    // snapshot; los índices del tramo anclado se ignoran (nunca se
    // auto-resuelven). La eliminación es por id sobre la cola viva: un ítem
    // anclado entre medias ya no está en pending y el filtro es un no-op.
    for (const index of outcome.resolvedQueueIndexes) {
      if (index < pendingSnapshotCount) {
        const resolvedId = queueSnapshot[index].id
        target.pending = target.pending.filter((item) => item.id !== resolvedId)
      }
    }
    // 2. Aceptación de la candidata (SPEC-036): supresión determinista por
    // similitud contra TODA la cola (segunda barrera) y gate de capacidad con
    // >= (cubre el exceso temporal por desanclado). suggestionCount solo
    // cuenta candidatas aceptadas.
    if (
      !isSimilarToQueue(target, outcome.suggestion.suggestedQuestion) &&
      target.pending.length < target.maxPending
    ) {
      target.pending.unshift({ ...outcome.suggestion, id: randomUUID() })
      target.suggestionCount += 1
    }
    for (const index of outcome.objectivesMet) {
      target.objectivesMet.add(index)
    }
    // Medición de la sesión (SPEC-021): SOLO en el camino de éxito completo
    // (una llamada que falla no cambia el acumulado, AC). SPEC-023: se
    // acumulan los 4 componentes y el coste se recomputa desde los totales
    // con sus tarifas (los de caché se pliegan en inputTokens para la UI).
    target.tokenTotals.input += outcome.tokens.inputTokens
    target.tokenTotals.output += outcome.tokens.outputTokens
    target.tokenTotals.cacheWrite += outcome.tokens.cacheCreationInputTokens
    target.tokenTotals.cacheRead += outcome.tokens.cacheReadInputTokens
    target.usage.calls += 1
    target.usage.inputTokens =
      target.tokenTotals.input + target.tokenTotals.cacheWrite + target.tokenTotals.cacheRead
    target.usage.outputTokens = target.tokenTotals.output
    target.usage.estimatedCostUsd = computeCostUsd(
      target.tokenTotals.input,
      target.tokenTotals.output,
      target.tokenTotals.cacheWrite,
      target.tokenTotals.cacheRead
    )
    emitUpdate(target, {
      state: 'active',
      queue: buildQueuePayload(target),
      objectivesMet: sortedObjectivesMet(target),
      usage: { ...target.usage }
    })
  } catch (error) {
    if (session !== target) {
      return
    }
    // SIN resetear contadores: el material acumulado reintenta en la siguiente ventana
    const llmError: LlmError = toLlmError(mapSdkError(error))
    const event: AssistantUpdateEvent = {
      state: 'error',
      queue: buildQueuePayload(target),
      objectivesMet: sortedObjectivesMet(target),
      error: llmError
    }
    if (target.usage.calls > 0) {
      event.usage = { ...target.usage }
    }
    emitUpdate(target, event)
  } finally {
    target.inFlight = false
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(personaBlock: string): string {
  // SPEC-026/031: `personaBlock` llega resuelto UNA vez en startAssistant
  // (salvaguarda + persona delimitada; override de Ajustes → default) para que
  // el prefijo cacheado sea byte-estable en sesión.
  return [
    personaBlock,
    // SPEC-023: los objetivos y el guión viven en este prefijo fijo; en cada
    // mensaje solo llega la parte variable (ventana + índices cubiertos)
    'Más abajo tienes, si existen, los objetivos y el guión de la entrevista. En cada mensaje recibirás la ventana reciente de la conversación (transcrita en vivo, puede contener errores) y los índices de los objetivos ya cubiertos. Tu tarea: decidir la siguiente jugada del entrevistador.',
    'Reglas:',
    '- Escribe TODO en español.',
    "- `action`: 'dig_deeper' si la última respuesta del interlocutor carece de evidencia concreta (hechos pasados, cifras, ejemplos reales) o toca un objetivo aún no cubierto; 'continue' si ya hay material concreto suficiente para avanzar con el guión.",
    `- \`suggestedQuestion\`: la siguiente pregunta exacta que debe hacer el entrevistador, breve (máximo ${SUGGESTED_QUESTION_MAX_CHARS} caracteres) y sobre hechos pasados y comportamiento concreto.`,
    `- \`reason\`: el porqué en UNA sola frase corta (máximo ${REASON_MAX_CHARS} caracteres). Con 'dig_deeper', referencia el motivo concreto: la evidencia que falta según The Mom Test o el objetivo aún no cubierto.`,
    "- `alarms`: señales de alarma detectadas en las últimas intervenciones del interlocutor: 'compliment' (cumplidos: «suena interesante»), 'generic' (genéricos: «normalmente hacemos»), 'hypothetical' (futuros hipotéticos: «lo compraríamos»). Array vacío si no hay. Si detectas una alarma, la pregunta sugerida debe reconducir a lo concreto (hechos pasados, casos reales).",
    '- `objectivesMet`: índices (0-based) de los objetivos YA cubiertos por la conversación, incluidos los que se marcaron cubiertos en análisis anteriores. Array vacío si no hay objetivos.',
    // SPEC-036/037: primera barrera de similitud (la segunda, determinista,
    // vive en main) + resolución automática de la cola. Texto estático: cambia
    // entre releases, no dentro de la sesión — byte-estabilidad SPEC-023 intacta.
    '- En cada mensaje recibirás la lista numerada de preguntas ya en cola; NO propongas una pregunta igual, casi igual ni una reformulación del mismo tema con otras palabras respecto a ninguna de ellas: aporta la siguiente jugada.',
    '- Si la mejor siguiente pregunta ya está en la cola, repite EXACTAMENTE el mismo texto de la pregunta en cola, sin reformularla.',
    '- `resolvedQueueIndexes`: índices (0-based) de las preguntas en cola cuyo tema YA quedó cubierto por la conversación; array vacío si ninguna.',
    '- Responde únicamente con el JSON pedido.'
  ].join('\n')
}

/**
 * Prefijo fijo del prompt en formato de bloques (SPEC-023): instrucciones +
 * guión/objetivos SIN estado dinámico ([cubierto|pendiente] viaja como índices
 * en el mensaje de usuario). `cache_control` ephemeral SOLO en el último
 * bloque: cachea todo el prefijo (TTL 5 min; las llamadas van ≥20 s aparte).
 * Nota: por debajo del mínimo cacheable del modelo (~1024 tokens de prefijo,
 * p. ej. sin guión) el caché no aplica — degradación silenciosa sin error, la
 * ganancia de salida acotada se mantiene.
 */
function buildSystemBlocks(
  objectives: string[],
  scriptExcerpt: string | null,
  personaBlock: string
): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    { type: 'text', text: buildSystemPrompt(personaBlock) }
  ]
  const contextSections: string[] = []
  if (objectives.length > 0) {
    const objectiveLines = objectives.map((objective, index) => `${index}. ${objective}`)
    contextSections.push(`## Objetivos de la entrevista\n${objectiveLines.join('\n')}`)
  }
  if (scriptExcerpt !== null) {
    contextSections.push(`## Guión de la entrevista\n${scriptExcerpt}`)
  }
  if (contextSections.length > 0) {
    blocks.push({ type: 'text', text: contextSections.join('\n\n') })
  }
  blocks[blocks.length - 1].cache_control = { type: 'ephemeral' }
  return blocks
}

/**
 * Parte VARIABLE del prompt (SPEC-023): índices de objetivos cubiertos +
 * ventana de conversación + cola de preguntas + tarea. Siempre string (los
 * consumidores leen `messages[0].content` como string). La cola viaja SOLO
 * aquí, nunca en systemBlocks (byte-estabilidad del prefijo cacheado,
 * invariante de SPEC-023 preservada por SPEC-036).
 */
function buildUserPrompt(target: AssistantSession): string {
  const sections: string[] = []

  // El estado dinámico de los objetivos sale del prefijo cacheado y viaja
  // aquí compacto (los textos de los objetivos viven en systemBlocks)
  if (target.objectives.length > 0) {
    const covered = sortedObjectivesMet(target)
    sections.push(
      `## Objetivos ya cubiertos (índices)\n${covered.length > 0 ? covered.join(', ') : 'ninguno'}`
    )
  }

  const conversation = target.lines
    .map((line) => {
      const speaker = line.speaker !== null ? ` s${line.speaker}` : ''
      return `[${line.channel}${speaker}] ${line.text}`
    })
    .join('\n')
    .slice(-TRANSCRIPT_WINDOW_CHARS)
  sections.push(
    `## Conversación reciente (mic = entrevistador, system = interlocutor)\n${conversation}`
  )

  // Cola de preguntas (SPEC-036): pendientes primero (índices 0..p-1) y luego
  // ancladas marcadas «(anclada)». El crecimiento está acotado por el tamaño
  // máximo (≤5 preguntas cortas).
  const queueItems = [...target.pending, ...target.pinned]
  const queueLines =
    queueItems.length > 0
      ? queueItems
          .map((item, index) => {
            const pinnedMark = index >= target.pending.length ? '(anclada) ' : ''
            return `${index}. ${pinnedMark}${item.suggestedQuestion}`
          })
          .join('\n')
      : 'ninguna'
  sections.push(`## Preguntas en cola (índices 0-based)\n${queueLines}`)

  sections.push(
    '## Tarea\nAnaliza la conversación y devuelve la siguiente jugada del entrevistador en el JSON pedido.'
  )

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Llamada + parseo defensivo
// ---------------------------------------------------------------------------

interface AnalysisOutcome {
  suggestion: AssistantSuggestion
  objectivesMet: number[]
  /** Índices de la cola (tal como viajó en el prompt) ya cubiertos (SPEC-036). */
  resolvedQueueIndexes: number[]
}

/**
 * Outcome del análisis + tokens de la respuesta (SPEC-021). SPEC-023: viajan
 * los 4 componentes (entrada no cacheada, salida, escritura y lectura de
 * caché) para que el acumulador recompute el coste con sus tarifas reales.
 */
interface AnalysisResult extends AnalysisOutcome {
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
  }
}

const FORMAT_ERROR_MESSAGE = 'La respuesta de la IA no tiene el formato esperado.'

/** Valida la forma del JSON devuelto; alarmas e índices fuera de rango se filtran. */
function parseAnalysis(raw: string, objectiveCount: number, queueCount: number): AnalysisOutcome {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  const record = parsed as Record<string, unknown>
  const action = record.action
  const suggestedQuestion = record.suggestedQuestion
  const reason = record.reason
  if (
    (action !== 'dig_deeper' && action !== 'continue') ||
    typeof suggestedQuestion !== 'string' ||
    suggestedQuestion.trim() === '' ||
    typeof reason !== 'string'
  ) {
    throw new LlmOperationError('format', FORMAT_ERROR_MESSAGE)
  }
  const alarms: AssistantAlarm[] = Array.isArray(record.alarms)
    ? record.alarms.filter(
        (item): item is AssistantAlarm =>
          item === 'compliment' || item === 'generic' || item === 'hypothetical'
      )
    : []
  const objectivesMet: number[] = Array.isArray(record.objectivesMet)
    ? record.objectivesMet.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isInteger(item) && item >= 0 && item < objectiveCount
      )
    : []
  // SPEC-036: mismo parseo defensivo que objectivesMet — no-array → [];
  // no-enteros y fuera de [0, queueCount) se filtran
  const resolvedQueueIndexes: number[] = Array.isArray(record.resolvedQueueIndexes)
    ? record.resolvedQueueIndexes.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isInteger(item) && item >= 0 && item < queueCount
      )
    : []
  return {
    suggestion: {
      action,
      suggestedQuestion: suggestedQuestion.trim(),
      reason: reason.trim(),
      alarms
    },
    objectivesMet,
    resolvedQueueIndexes
  }
}

async function requestSuggestion(target: AssistantSession): Promise<AnalysisResult> {
  const client = new Anthropic({ apiKey: target.apiKey })
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      // SPEC-023: prefijo fijo cacheado, construido una vez por sesión
      system: target.systemBlocks,
      messages: [{ role: 'user', content: buildUserPrompt(target) }]
    })
  } catch (error) {
    throw mapSdkError(error)
  }
  if (response.stop_reason !== 'end_turn') {
    throw new LlmOperationError(
      'format',
      `El análisis no terminó correctamente (stop_reason: ${String(response.stop_reason)}).`
    )
  }
  // Filtrar bloques thinking: el JSON viene en el primer bloque text
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )
  if (textBlock === undefined) {
    throw new LlmOperationError('format', 'La respuesta de la IA no contiene texto.')
  }
  // Los tokens solo acompañan a un análisis parseado con éxito (SPEC-021):
  // parseAnalysis lanza antes de devolverlos si el formato no valida
  const outcome = parseAnalysis(
    textBlock.text,
    target.objectives.length,
    target.pending.length + target.pinned.length
  )
  return { ...outcome, tokens: extractUsage(response) }
}

// ---------------------------------------------------------------------------
// Anclado + cierre
// ---------------------------------------------------------------------------

/**
 * Ancla o desancla una pregunta de la cola (SPEC-036). Sin sesión o con id
 * inexistente es un no-op silencioso (fire-and-forget, patrón resume).
 * Anclar mueve de pendientes a ancladas (append); desanclar devuelve la
 * pregunta al FRENTE de pendientes (coherente con «más reciente primero»),
 * aunque la cola quede temporalmente por encima del máximo — mientras esté
 * por encima no entran candidatas nuevas (gate >= en runAnalysis). Tras
 * mutar se re-emite la cola completa con el estado derivado (un análisis en
 * vuelo conserva su spinner).
 */
export function setAssistantPinned(itemId: string, pinned: boolean): void {
  if (session === null) {
    return
  }
  const target = session
  if (pinned) {
    const item = target.pending.find((candidate) => candidate.id === itemId)
    if (item === undefined) {
      return
    }
    target.pending = target.pending.filter((candidate) => candidate.id !== itemId)
    target.pinned.push(item)
  } else {
    const item = target.pinned.find((candidate) => candidate.id === itemId)
    if (item === undefined) {
      return
    }
    target.pinned = target.pinned.filter((candidate) => candidate.id !== itemId)
    target.pending.unshift(item)
  }
  const event: AssistantUpdateEvent = {
    state: target.inFlight
      ? 'analyzing'
      : target.pending.length + target.pinned.length > 0
        ? 'active'
        : 'idle',
    queue: buildQueuePayload(target),
    objectivesMet: sortedObjectivesMet(target)
  }
  if (target.usage.calls > 0) {
    event.usage = { ...target.usage }
  }
  emitUpdate(target, event)
}

/**
 * Reanuda el asistente pausado por límite de coste (SPEC-021): desactiva la
 * comprobación del límite para el RESTO de la sesión (no vuelve a pausar, AC)
 * y reintenta el análisis respetando los disparadores de SPEC-016. Sin sesión
 * es un no-op silencioso.
 */
export function resumeAssistantLimit(): void {
  if (session === null) {
    return
  }
  const target = session
  target.limitOverridden = true
  target.pausedByLimit = false
  const event: AssistantUpdateEvent = {
    state: target.pending.length + target.pinned.length > 0 ? 'active' : 'idle',
    queue: buildQueuePayload(target),
    objectivesMet: sortedObjectivesMet(target)
  }
  if (target.usage.calls > 0) {
    event.usage = { ...target.usage }
  }
  emitUpdate(target, event)
  maybeAnalyze(target, 1)
}

/**
 * Índices de objetivos cubiertos por el seguimiento en vivo de la sesión
 * activa (SPEC-025): pista no vinculante para la evaluación post-grabación.
 * Llamar ANTES de stopAssistant (que destruye la sesión). Sin sesión → [].
 */
export function peekAssistantObjectivesMet(): number[] {
  return session !== null ? sortedObjectivesMet(session) : []
}

/**
 * Desactiva el asistente y devuelve el registro de la sesión para persistirlo
 * en el transcript.json. SÍNCRONO: llamar desde `recording:stop` ANTES de
 * persistTranscript (y en el camino de error, descartando el resultado).
 * Una respuesta de análisis todavía en vuelo se descarta (session !== target).
 * @returns null si el asistente no llegó a activarse (sin clave / sin entrevista).
 */
export function stopAssistant(): AssistantSessionSummary | null {
  if (session === null) {
    return null
  }
  const target = session
  session = null
  setFinalLineListener(null)
  if (target.fallbackTimer !== null) {
    clearInterval(target.fallbackTimer)
    target.fallbackTimer = null
  }
  return {
    suggestionCount: target.suggestionCount,
    usage: { ...target.usage }
  }
}
