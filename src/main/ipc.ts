import { BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { readFileSync } from 'fs'
import type {
  LatencyStats,
  PermissionTarget,
  StopResult,
  TranscriptConsent,
  TranscriptLinesResult
} from '../renderer/src/types/audio'
import type { Interview } from '../renderer/src/types/domain'
import type { SecretKind, SecretsResult } from '../renderer/src/types/secrets'
import type { LlmResult } from '../renderer/src/types/llm'
import type { NoteExportResult, NoteExportTarget } from '../renderer/src/types/notes'
import {
  askForMicrophoneAccess,
  getPermissionsSnapshot,
  openPrivacySettings
} from './permissionService'
import { startRecording, stopRecording, writeChunk } from './wavFileService'
import {
  finishTranscription,
  persistTranscript,
  pushAudio,
  resetTranscription,
  startTranscription
} from './transcriptionService'
import { registerDbIpcHandlers } from './db/ipc'
import { setInterviewQuestionOutcomes, updateInterview } from './db/repository'
import {
  getSecretsStatus,
  initSecrets,
  removeSecret,
  saveSecret,
  toSecretsError
} from './secretsService'
import { generateInterviewScript, getLlmStatus, toLlmError } from './llmService'
import {
  generateCompanyContext,
  generateContactContext,
  getContextCapabilities
} from './contextService'
import {
  exportInterviewDocument,
  generateInterviewNote,
  readTranscriptLines,
  toNoteExportError
} from './noteService'
import {
  peekAssistantObjectivesMet,
  resolveAssistantItem,
  resumeAssistantLimit,
  setAssistantPinned,
  startAssistant,
  stopAssistant
} from './assistantService'
import type { AssistantQuestionOutcome } from '../renderer/src/types/assistant'
import {
  evaluateInterviewObjectives,
  maybeEvaluateAfterRecording
} from './objectiveEvaluationService'
import { overrideInterviewObjective } from './objectiveOverrideService'
import { autoGenerateInterviewScript } from './scriptAutoGenerationService'
import { recordAssistantSessionUsage } from './aiCost'

/**
 * Registra un canal secrets:* que SIEMPRE resuelve con el envelope
 * SecretsResult (mismo patrón que db:*): la promesa nunca se rechaza, los
 * fallos tipados viajan como { ok: false, error }. La clave en claro solo
 * entra por `secrets:save`; ninguna respuesta la contiene ni la loguea.
 */
function handleSecrets<Args extends unknown[], T>(
  channel: string,
  operation: (...args: Args) => T
): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]): SecretsResult<T> => {
    try {
      return { ok: true, data: operation(...(args as Args)) }
    } catch (error) {
      return { ok: false, error: toSecretsError(error) }
    }
  })
}

/**
 * Registra un canal llm:* que SIEMPRE resuelve con el envelope LlmResult
 * (mismo patrón que db:* y secrets:*), pero ASYNC: la generación con Claude es
 * una promesa y hay que await-earla para capturar sus rechazos como
 * { ok: false, error }. La clave de Anthropic nunca entra ni sale por aquí.
 */
function handleLlm<Args extends unknown[], T>(
  channel: string,
  operation: (...args: Args) => T | Promise<T>
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<LlmResult<T>> => {
    try {
      return { ok: true, data: await operation(...(args as Args)) }
    } catch (error) {
      return { ok: false, error: toLlmError(error) }
    }
  })
}

/**
 * Entrevista a la que pertenece la grabación en curso (SPEC-015); null cuando
 * la captura viene del harness /capture. Se resuelve y resetea SIEMPRE en
 * `recording:stop` (todos los caminos de parada — detener, desconexión,
 * cierre, error de escritura — pasan por él).
 */
let activeInterviewId: string | null = null

/**
 * Registro de consentimiento de la grabación en curso (SPEC-019); null cuando
 * el aviso no se reconoció (captura del harness /capture). Espejo del ciclo de
 * vida de activeInterviewId: se asigna en `recording:start` TRAS el guard y se
 * resetea en TODOS los caminos de `recording:stop` (incluido el catch), de
 * modo que el consent de una entrevista jamás se filtra a la siguiente sesión.
 */
let activeConsent: TranscriptConsent | null = null

/** Registra todos los canales IPC del spike (excepto el close guard, que vive en index.ts). */
export function registerIpcHandlers(): void {
  registerDbIpcHandlers()

  initSecrets()

  handleSecrets('secrets:get-status', getSecretsStatus)
  handleSecrets('secrets:save', (kind: SecretKind, value: string) => saveSecret(kind, value))
  handleSecrets('secrets:remove', (kind: SecretKind) => removeSecret(kind))

  handleLlm('llm:get-status', getLlmStatus)
  handleLlm('llm:generate-script', (interviewId: string) => generateInterviewScript(interviewId))
  // Nota de resumen (SPEC-017): mismo envelope LlmResult que el guión
  handleLlm('llm:generate-note', (interviewId: string, noteTemplateId: string) =>
    generateInterviewNote(interviewId, noteTemplateId)
  )
  // Evaluación manual de objetivos (SPEC-025): mismo envelope LlmResult. Sin
  // pista de seguimiento en vivo (no hay sesión del asistente en este camino).
  handleLlm('llm:evaluate-objectives', (interviewId: string) =>
    evaluateInterviewObjectives(interviewId)
  )
  // Marca manual de cumplimiento (SPEC-028): mismo envelope LlmResult.
  handleLlm(
    'llm:override-objective',
    (interviewId: string, objectiveIndex: number, met: boolean, comment: string) =>
      overrideInterviewObjective(interviewId, objectiveIndex, met, comment)
  )
  // Autogeneración del guión al crear la captura (SPEC-033): fire-and-forget,
  // el handler resuelve tras los guards síncronos y jamás espera al LLM.
  handleLlm('llm:auto-generate-script', (interviewId: string) => {
    autoGenerateInterviewScript(interviewId)
  })
  // Contexto de empresas y contactos: capacidades (clave + MCP de LinkedIn)
  // y generación con persistencia en main; mismo envelope LlmResult.
  handleLlm('llm:get-context-capabilities', getContextCapabilities)
  handleLlm('llm:generate-company-context', (companyId: string) =>
    generateCompanyContext(companyId)
  )
  handleLlm('llm:generate-contact-context', (contactId: string) =>
    generateContactContext(contactId)
  )

  /**
   * Exportación a Markdown (SPEC-017): handler ad-hoc (no handleLlm) porque el
   * error tipado es NoteExportError y el save dialog necesita la ventana del
   * remitente. SIEMPRE resuelve con el envelope NoteExportResult.
   */
  ipcMain.handle(
    'notes:export',
    async (event, interviewId: string, target: NoteExportTarget): Promise<NoteExportResult> => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        return { ok: true, data: await exportInterviewDocument(window, interviewId, target) }
      } catch (error) {
        return { ok: false, error: toNoteExportError(error) }
      }
    }
  )

  /**
   * Tema (dark mode): el renderer gobierna la preferencia (localStorage) y la
   * propaga aquí para que el chrome nativo (barra de título, diálogos)
   * acompañe. Validación en frontera: un payload inesperado se ignora.
   */
  ipcMain.on('window:set-theme', (_event, theme: unknown) => {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      nativeTheme.themeSource = theme
    }
  })

  ipcMain.handle('permissions:get-status', () => getPermissionsSnapshot())

  ipcMain.handle('permissions:request-microphone', () => askForMicrophoneAccess())

  ipcMain.handle('permissions:open-settings', (_event, target: PermissionTarget) =>
    openPrivacySettings(target)
  )

  ipcMain.handle(
    'recording:start',
    (event, interviewId?: string | null, consentAcknowledgedAt?: string | null) => {
      // El guard de startRecording ("Ya hay una grabación en curso") lanza ANTES
      // de tocar activeInterviewId/activeConsent: un segundo start no roba la asociación
      const filePath = startRecording()
      activeInterviewId = interviewId ?? null
      // Consentimiento (SPEC-019): decidido en el renderer, persistido al detener
      activeConsent =
        consentAcknowledgedAt !== undefined && consentAcknowledgedAt !== null
          ? { acknowledgedAt: consentAcknowledgedAt }
          : null
      // Transcripción acoplada a la captura (SPEC-002): sin gesto adicional
      startTranscription(event.sender)
      // Asistente proactivo (SPEC-016): SOLO con entrevista, nunca en /capture.
      // Sin clave de Anthropic emite 'no-key' y queda inerte (cero llamadas).
      if (activeInterviewId !== null) {
        startAssistant(event.sender, activeInterviewId)
      }
      return filePath
    }
  )

  ipcMain.on('recording:write-chunk', (event, chunk: ArrayBuffer) => {
    const buffer = Buffer.from(chunk)
    try {
      writeChunk(buffer)
    } catch (error) {
      event.sender.send(
        'recording:error',
        `Error al escribir el archivo de grabación: ${String(error)}`
      )
    }
    // Tee hacia Deepgram: nunca puede afectar a la escritura del WAV
    try {
      pushAudio(buffer)
    } catch {
      // la transcripción es degradable; el WAV sigue siendo la fuente de verdad
    }
  })

  ipcMain.handle('recording:stop', async (): Promise<StopResult> => {
    // Pista del seguimiento en vivo para la evaluación de objetivos
    // (SPEC-025): se captura ANTES de stopAssistant, que destruye la sesión.
    const objectivesMetHint = peekAssistantObjectivesMet()
    // El asistente se desactiva SÍNCRONO y primero (SPEC-016): ni el flush de
    // Deepgram ni la parada del WAV pueden disparar más análisis; una
    // respuesta aún en vuelo se descarta en el servicio.
    const assistantSummary = stopAssistant()
    // Después el flush de Deepgram (CloseStream + últimos finales), luego el WAV
    await finishTranscription()
    let result: ReturnType<typeof stopRecording>
    try {
      result = stopRecording()
    } catch (error) {
      resetTranscription()
      activeInterviewId = null
      activeConsent = null
      throw error
    }
    // El consent se consume y resetea SIEMPRE aquí (SPEC-019), también cuando
    // no hay entrevista: el registro de una sesión nunca sobrevive a su parada
    const consent = activeConsent
    activeConsent = null
    const { transcriptPath, latency } = persistTranscript(
      result.filePath,
      assistantSummary,
      consent
    )
    // Asociación a la entrevista (SPEC-015): main persiste la vinculación
    // aunque el renderer ya no esté montado (auto-guardado al navegar)
    let interview: Interview | null = null
    if (activeInterviewId !== null) {
      // Volcado del uso del asistente (SPEC-021) ANTES de updateInterview:
      // la Interview devuelta ya incluye el aiUsage con el gasto de la sesión.
      // Best-effort (recordInterviewUsage jamás lanza): un fallo de medición
      // nunca afecta a wavPath/transcriptPath ni a la parada.
      if (assistantSummary !== null && assistantSummary.usage.calls > 0) {
        // El usage de la sesión ya viene desglosado por tarea (byTask) y con
        // el coste recomputado por componentes con la tarifa de cada modelo.
        recordAssistantSessionUsage(activeInterviewId, assistantSummary.usage)
      }
      // Desenlaces manuales de las preguntas (SPEC-039) ANTES de
      // updateInterview: la Interview devuelta en StopResult ya los lleva.
      // Best-effort (patrón recordInterviewUsage): un fallo aquí nunca afecta
      // a wavPath/transcriptPath ni a la parada.
      if (assistantSummary !== null && assistantSummary.questionOutcomes.length > 0) {
        try {
          setInterviewQuestionOutcomes(activeInterviewId, assistantSummary.questionOutcomes)
        } catch {
          // Entrevista borrada o almacén ilegible: la parada sigue su curso
        }
      }
      try {
        interview = updateInterview(activeInterviewId, {
          wavPath: result.filePath,
          transcriptPath,
          status: 'recorded'
        })
      } catch {
        // Entrevista borrada durante la grabación: los archivos se conservan
        interview = null
      }
      // Evaluación de objetivos post-grabación (SPEC-025): fire-and-forget
      // TRAS asociar la grabación — la parada nunca espera al LLM y ningún
      // fallo de la evaluación afecta al guardado (guards en el servicio).
      if (interview !== null) {
        maybeEvaluateAfterRecording(interview.id, objectivesMetHint)
      }
      activeInterviewId = null
    }
    return { ...result, transcriptPath, latency, interview }
  })

  ipcMain.handle(
    'recording:get-transcript-stats',
    (_event, transcriptPath: string): LatencyStats | null => {
      // Resumen tras recarga (SPEC-015): lee el {lines, latency} persistido
      try {
        const parsed = JSON.parse(readFileSync(transcriptPath, 'utf-8')) as {
          latency?: LatencyStats | null
        }
        return parsed.latency ?? null
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(
    'recording:get-transcript-lines',
    (_event, transcriptPath: string): TranscriptLinesResult =>
      // Consulta de la transcripción (SPEC-017): envelope propio, ilegible →
      // { ok: false, kind: 'unreadable' } (a diferencia de get-transcript-stats → null)
      readTranscriptLines(transcriptPath)
  )

  ipcMain.handle('recording:show-in-finder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  // Anclar/desanclar una pregunta de la cola del asistente (SPEC-036):
  // fire-and-forget que nunca falla (no-ops en el servicio), patrón resume
  ipcMain.handle('assistant:set-pinned', (_event, itemId: string, pinned: boolean) => {
    setAssistantPinned(itemId, pinned)
  })

  // Descartar / marcar respondida una pregunta de la cola (SPEC-039):
  // fire-and-forget que nunca falla (no-ops en el servicio), patrón set-pinned
  ipcMain.handle(
    'assistant:resolve-item',
    (_event, itemId: string, outcome: AssistantQuestionOutcome) => {
      resolveAssistantItem(itemId, outcome)
    }
  )

  // Reanudar el asistente pausado por límite de coste (SPEC-021)
  ipcMain.handle('assistant:resume', () => {
    resumeAssistantLimit()
  })
}
