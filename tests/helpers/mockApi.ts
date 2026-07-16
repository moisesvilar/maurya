/**
 * Mock tipado del bridge `window.api` (frontera de mocking del renderer).
 * Cada función es un vi.fn() con la firma exacta de MauryaApi, de modo que los
 * tests pueden configurarlo con vi.mocked(...) sin ningún `as any`.
 */
import { vi } from 'vitest'
import type { AssistantApi, AssistantUpdateEvent } from '@/types/assistant'
import type { MauryaApi, TranscriptResultEvent, TranscriptionStatusEvent } from '@/types/audio'
import type { DbApi } from '@/types/domain'
import type { LlmApi, ObjectiveEvaluationEvent, ScriptGenerationEvent } from '@/types/llm'
import type { NotesApi } from '@/types/notes'
import type { SecretsApi } from '@/types/secrets'

/**
 * Forma completa del bridge: MauryaApi + api.db (SPEC-006) + api.secrets
 * (SPEC-007) + api.llm (SPEC-014) + api.assistant (SPEC-016) + api.notes
 * (SPEC-017).
 */
export type BridgeApi = MauryaApi & {
  db: DbApi
  secrets: SecretsApi
  llm: LlmApi
  assistant: AssistantApi
  notes: NotesApi
}

/**
 * Mock tipado de api.llm (SPEC-014/017/025/028/033). getStatus resuelve por
 * defecto SIN clave de Anthropic (estado conservador); generateScript/
 * generateNote/evaluateObjectives/overrideObjective se configuran por test.
 * onObjectiveEvaluation registra el callback para inyectar eventos con
 * emitObjectiveEvaluation (SPEC-025); onScriptGeneration hace lo propio con
 * emitScriptGeneration (SPEC-033). autoGenerateScript resuelve ok por defecto
 * (disparo fire-and-forget: main aplica los guards en silencio).
 */
function createMockLlmApi(
  objectiveEvaluationCallbacks: Array<(event: ObjectiveEvaluationEvent) => void>,
  scriptGenerationCallbacks: Array<(event: ScriptGenerationEvent) => void>
): LlmApi {
  return {
    getStatus: vi.fn<LlmApi['getStatus']>().mockResolvedValue({
      ok: true,
      data: { hasAnthropicKey: false }
    }),
    // Contexto de empresas/contactos: capacidades conservadoras por defecto
    // (sin clave y sin MCP); la generación se configura por test.
    getContextCapabilities: vi.fn<LlmApi['getContextCapabilities']>().mockResolvedValue({
      ok: true,
      data: { hasAnthropicKey: false, linkedinMcpConfigured: false }
    }),
    generateCompanyContext: vi.fn<LlmApi['generateCompanyContext']>(),
    generateContactContext: vi.fn<LlmApi['generateContactContext']>(),
    generateScript: vi.fn<LlmApi['generateScript']>(),
    generateNote: vi.fn<LlmApi['generateNote']>(),
    evaluateObjectives: vi.fn<LlmApi['evaluateObjectives']>(),
    // SPEC-028: marca manual de cumplimiento con reescritura (se configura por test)
    overrideObjective: vi.fn<LlmApi['overrideObjective']>(),
    onObjectiveEvaluation: vi.fn<LlmApi['onObjectiveEvaluation']>((callback) => {
      objectiveEvaluationCallbacks.push(callback)
      return () => {
        const index = objectiveEvaluationCallbacks.indexOf(callback)
        if (index >= 0) {
          objectiveEvaluationCallbacks.splice(index, 1)
        }
      }
    }),
    // SPEC-033: disparo fire-and-forget de la autogeneración del guión
    autoGenerateScript: vi
      .fn<LlmApi['autoGenerateScript']>()
      .mockResolvedValue({ ok: true, data: undefined }),
    onScriptGeneration: vi.fn<LlmApi['onScriptGeneration']>((callback) => {
      scriptGenerationCallbacks.push(callback)
      return () => {
        const index = scriptGenerationCallbacks.indexOf(callback)
        if (index >= 0) {
          scriptGenerationCallbacks.splice(index, 1)
        }
      }
    })
  }
}

/**
 * Mock tipado de api.notes (SPEC-017): exportación con save dialog del SO.
 * Default: exportación confirmada y escrita (los tests de cancelación/fallo
 * lo sobreescriben por test).
 */
export function createMockNotesApi(): NotesApi {
  return {
    export: vi.fn<NotesApi['export']>().mockResolvedValue({
      ok: true,
      data: { saved: true, filePath: '/tmp/x.md' }
    })
  }
}

/**
 * Mock tipado de api.secrets (SPEC-007). getStatus resuelve por defecto con
 * cifrado disponible y sin claves; save/remove se configuran por test.
 */
function createMockSecretsApi(): SecretsApi {
  return {
    getStatus: vi.fn<SecretsApi['getStatus']>().mockResolvedValue({
      ok: true,
      data: {
        available: true,
        deepgram: { configured: false, last4: null },
        anthropic: { configured: false, last4: null },
        linkedinMcp: { configured: false, last4: null }
      }
    }),
    save: vi.fn<SecretsApi['save']>(),
    remove: vi.fn<SecretsApi['remove']>()
  }
}

export interface MockApiHandle {
  api: BridgeApi
  /** Simula que main solicita el cierre de la ventana (before close). */
  emitCloseRequested: () => void
  /** Simula un error de escritura reportado por main durante el streaming. */
  emitRecordingError: (message: string) => void
  /** Simula un cambio de estado de la transcripción emitido por main (SPEC-002). */
  emitTranscriptionStatus: (event: TranscriptionStatusEvent) => void
  /** Simula un resultado (parcial o final) de transcripción emitido por main (SPEC-002). */
  emitTranscriptionResult: (event: TranscriptResultEvent) => void
  /** Simula un evento del asistente proactivo emitido por main (SPEC-016). */
  emitAssistantUpdate: (event: AssistantUpdateEvent) => void
  /** Simula un evento de la evaluación automática de objetivos (SPEC-025). */
  emitObjectiveEvaluation: (event: ObjectiveEvaluationEvent) => void
  /** Simula un evento de la autogeneración del guión (SPEC-033). */
  emitScriptGeneration: (event: ScriptGenerationEvent) => void
}

/**
 * Mock tipado de api.db (SPEC-006). Sin comportamiento por defecto salvo los
 * de solo-lectura seguros (getStatus, listados y getNoteByInterview): la UI
 * CRUD llega en H2 y cada test configurará lo que necesite con vi.mocked(...).
 */
function createMockDbApi(): DbApi {
  return {
    getStatus: vi
      .fn<DbApi['getStatus']>()
      .mockResolvedValue({ ok: true, data: { ready: true, initError: null } }),

    // SPEC-018: búsqueda global (default sin resultados; se configura por
    // test). SPEC-048: SearchResults gana `groups`.
    search: vi.fn<DbApi['search']>().mockResolvedValue({
      ok: true,
      data: { discoveries: [], groups: [], companies: [], contacts: [], interviews: [] }
    }),

    createDiscovery: vi.fn<DbApi['createDiscovery']>(),
    listDiscoveries: vi.fn<DbApi['listDiscoveries']>().mockResolvedValue({ ok: true, data: [] }),
    getDiscovery: vi.fn<DbApi['getDiscovery']>(),
    updateDiscovery: vi.fn<DbApi['updateDiscovery']>(),
    deleteDiscovery: vi.fn<DbApi['deleteDiscovery']>(),

    createCompany: vi.fn<DbApi['createCompany']>(),
    listCompanies: vi.fn<DbApi['listCompanies']>().mockResolvedValue({ ok: true, data: [] }),
    getCompany: vi.fn<DbApi['getCompany']>(),
    updateCompany: vi.fn<DbApi['updateCompany']>(),
    deleteCompany: vi.fn<DbApi['deleteCompany']>(),

    createContact: vi.fn<DbApi['createContact']>(),
    listContacts: vi.fn<DbApi['listContacts']>().mockResolvedValue({ ok: true, data: [] }),
    getContact: vi.fn<DbApi['getContact']>(),
    updateContact: vi.fn<DbApi['updateContact']>(),
    deleteContact: vi.fn<DbApi['deleteContact']>(),

    createInterviewTemplate: vi.fn<DbApi['createInterviewTemplate']>(),
    listInterviewTemplates: vi
      .fn<DbApi['listInterviewTemplates']>()
      .mockResolvedValue({ ok: true, data: [] }),
    getInterviewTemplate: vi.fn<DbApi['getInterviewTemplate']>(),
    updateInterviewTemplate: vi.fn<DbApi['updateInterviewTemplate']>(),
    deleteInterviewTemplate: vi.fn<DbApi['deleteInterviewTemplate']>(),

    // SPEC-043: grupos de entrevistas (listado con default vacío seguro; el
    // resto se configura por test)
    createInterviewGroup: vi.fn<DbApi['createInterviewGroup']>(),
    listInterviewGroups: vi
      .fn<DbApi['listInterviewGroups']>()
      .mockResolvedValue({ ok: true, data: [] }),
    getInterviewGroup: vi.fn<DbApi['getInterviewGroup']>(),
    updateInterviewGroup: vi.fn<DbApi['updateInterviewGroup']>(),
    deleteInterviewGroup: vi.fn<DbApi['deleteInterviewGroup']>(),

    createInterview: vi.fn<DbApi['createInterview']>(),
    listInterviews: vi.fn<DbApi['listInterviews']>().mockResolvedValue({ ok: true, data: [] }),
    getInterview: vi.fn<DbApi['getInterview']>(),
    updateInterview: vi.fn<DbApi['updateInterview']>(),
    deleteInterview: vi.fn<DbApi['deleteInterview']>(),
    // SPEC-020: listado global de capturas (default vacío, se configura por
    // test) y asignación compuesta de empresa/contacto (se configura por test)
    listAllInterviews: vi
      .fn<DbApi['listAllInterviews']>()
      .mockResolvedValue({ ok: true, data: [] }),
    assignInterviewCompany: vi.fn<DbApi['assignInterviewCompany']>(),
    // SPEC-039: motivos de las preguntas descartadas (se configura por test)
    setInterviewDiscardReasons: vi.fn<DbApi['setInterviewDiscardReasons']>(),

    createNoteTemplate: vi.fn<DbApi['createNoteTemplate']>(),
    listNoteTemplates: vi
      .fn<DbApi['listNoteTemplates']>()
      .mockResolvedValue({ ok: true, data: [] }),
    getNoteTemplate: vi.fn<DbApi['getNoteTemplate']>(),
    updateNoteTemplate: vi.fn<DbApi['updateNoteTemplate']>(),
    deleteNoteTemplate: vi.fn<DbApi['deleteNoteTemplate']>(),

    createNote: vi.fn<DbApi['createNote']>(),
    getNoteByInterview: vi
      .fn<DbApi['getNoteByInterview']>()
      .mockResolvedValue({ ok: true, data: null }),
    updateNote: vi.fn<DbApi['updateNote']>(),
    deleteNote: vi.fn<DbApi['deleteNote']>(),

    // SPEC-021: ajustes de coste de IA (default de solo-lectura seguro: sin
    // límite configurado; el set se configura por test)
    getAiCostSettings: vi
      .fn<DbApi['getAiCostSettings']>()
      .mockResolvedValue({ ok: true, data: { limitUsd: null } }),
    setAiCostSettings: vi.fn<DbApi['setAiCostSettings']>(),

    // SPEC-036: tamaño de la cola de preguntas del asistente (default de
    // solo-lectura seguro: 3; el set se configura por test)
    getAssistantSettings: vi
      .fn<DbApi['getAssistantSettings']>()
      .mockResolvedValue({ ok: true, data: { queueSize: 3 } }),
    setAssistantSettings: vi.fn<DbApi['setAssistantSettings']>(),

    // MCP de LinkedIn (default de solo-lectura seguro: no configurado; el set
    // se configura por test)
    getLinkedinMcpSettings: vi
      .fn<DbApi['getLinkedinMcpSettings']>()
      .mockResolvedValue({ ok: true, data: { url: null } }),
    setLinkedinMcpSettings: vi.fn<DbApi['setLinkedinMcpSettings']>(),

    // SPEC-026: prompts de IA personalizables (default de solo-lectura seguro:
    // catálogo vacío; save/reset se configuran por test)
    listCustomPrompts: vi.fn<DbApi['listCustomPrompts']>().mockResolvedValue({
      ok: true,
      data: []
    }),
    saveCustomPrompt: vi.fn<DbApi['saveCustomPrompt']>(),
    resetCustomPrompt: vi.fn<DbApi['resetCustomPrompt']>()
  }
}

export function createMockApi(): MockApiHandle {
  const closeCallbacks: Array<() => void> = []
  const errorCallbacks: Array<(message: string) => void> = []
  const statusCallbacks: Array<(event: TranscriptionStatusEvent) => void> = []
  const resultCallbacks: Array<(event: TranscriptResultEvent) => void> = []
  const assistantCallbacks: Array<(event: AssistantUpdateEvent) => void> = []
  const objectiveEvaluationCallbacks: Array<(event: ObjectiveEvaluationEvent) => void> = []
  const scriptGenerationCallbacks: Array<(event: ScriptGenerationEvent) => void> = []

  const api: BridgeApi = {
    db: createMockDbApi(),
    secrets: createMockSecretsApi(),
    llm: createMockLlmApi(objectiveEvaluationCallbacks, scriptGenerationCallbacks),
    notes: createMockNotesApi(),
    assistant: {
      onUpdate: vi.fn<AssistantApi['onUpdate']>((callback) => {
        assistantCallbacks.push(callback)
        return () => {
          const index = assistantCallbacks.indexOf(callback)
          if (index >= 0) {
            assistantCallbacks.splice(index, 1)
          }
        }
      }),
      // SPEC-036 (deroga el feedback 👍/👎 de SPEC-016): anclar/desanclar una
      // pregunta de la cola, fire-and-forget
      setPinned: vi.fn<AssistantApi['setPinned']>().mockResolvedValue(undefined),
      // SPEC-039: descartar / marcar respondida una pregunta, fire-and-forget
      resolveItem: vi.fn<AssistantApi['resolveItem']>().mockResolvedValue(undefined),
      // SPEC-021: reanuda el asistente pausado por límite de coste
      resume: vi.fn<AssistantApi['resume']>().mockResolvedValue(undefined)
    },
    permissions: {
      getStatus: vi.fn<MauryaApi['permissions']['getStatus']>().mockResolvedValue({
        microphone: 'granted',
        systemAudio: 'granted'
      }),
      requestMicrophone: vi
        .fn<MauryaApi['permissions']['requestMicrophone']>()
        .mockResolvedValue(true),
      openSettings: vi.fn<MauryaApi['permissions']['openSettings']>().mockResolvedValue(undefined)
    },
    recording: {
      start: vi
        .fn<MauryaApi['recording']['start']>()
        .mockResolvedValue('/tmp/maurya-recordings/spike-test.wav'),
      writeChunk: vi.fn<MauryaApi['recording']['writeChunk']>(),
      stop: vi.fn<MauryaApi['recording']['stop']>(),
      showInFinder: vi.fn<MauryaApi['recording']['showInFinder']>().mockResolvedValue(undefined),
      // SPEC-015: latencia del transcript persistido (Estado 3 tras recarga)
      getTranscriptStats: vi
        .fn<MauryaApi['recording']['getTranscriptStats']>()
        .mockResolvedValue(null),
      // SPEC-017: líneas de la transcripción para el Sheet y la exportación
      getTranscriptLines: vi
        .fn<MauryaApi['recording']['getTranscriptLines']>()
        .mockResolvedValue({ ok: true, lines: [] }),
      onError: vi.fn<MauryaApi['recording']['onError']>((callback) => {
        errorCallbacks.push(callback)
        return () => {
          const index = errorCallbacks.indexOf(callback)
          if (index >= 0) {
            errorCallbacks.splice(index, 1)
          }
        }
      })
    },
    transcription: {
      onStatus: vi.fn<MauryaApi['transcription']['onStatus']>((callback) => {
        statusCallbacks.push(callback)
        return () => {
          const index = statusCallbacks.indexOf(callback)
          if (index >= 0) {
            statusCallbacks.splice(index, 1)
          }
        }
      }),
      onResult: vi.fn<MauryaApi['transcription']['onResult']>((callback) => {
        resultCallbacks.push(callback)
        return () => {
          const index = resultCallbacks.indexOf(callback)
          if (index >= 0) {
            resultCallbacks.splice(index, 1)
          }
        }
      })
    },
    window: {
      onCloseRequested: vi.fn<MauryaApi['window']['onCloseRequested']>((callback) => {
        closeCallbacks.push(callback)
        return () => {
          const index = closeCallbacks.indexOf(callback)
          if (index >= 0) {
            closeCallbacks.splice(index, 1)
          }
        }
      }),
      confirmClose: vi.fn<MauryaApi['window']['confirmClose']>(),
      // Tema (dark mode): fire-and-forget hacia main, sin retorno que configurar
      setTheme: vi.fn<MauryaApi['window']['setTheme']>()
    }
  }

  return {
    api,
    emitCloseRequested: (): void => {
      closeCallbacks.slice().forEach((callback) => callback())
    },
    emitRecordingError: (message: string): void => {
      errorCallbacks.slice().forEach((callback) => callback(message))
    },
    emitTranscriptionStatus: (event: TranscriptionStatusEvent): void => {
      statusCallbacks.slice().forEach((callback) => callback(event))
    },
    emitTranscriptionResult: (event: TranscriptResultEvent): void => {
      resultCallbacks.slice().forEach((callback) => callback(event))
    },
    emitAssistantUpdate: (event: AssistantUpdateEvent): void => {
      assistantCallbacks.slice().forEach((callback) => callback(event))
    },
    emitObjectiveEvaluation: (event: ObjectiveEvaluationEvent): void => {
      objectiveEvaluationCallbacks.slice().forEach((callback) => callback(event))
    },
    emitScriptGeneration: (event: ScriptGenerationEvent): void => {
      scriptGenerationCallbacks.slice().forEach((callback) => callback(event))
    }
  }
}

/** Instala el mock como window.api y lo devuelve. */
export function installMockApi(): MockApiHandle {
  const handle = createMockApi()
  window.api = handle.api
  return handle
}
