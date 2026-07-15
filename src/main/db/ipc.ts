import { ipcMain } from 'electron'
import type { DbResult } from '../../renderer/src/types/domain'
import { toDbError } from './errors'
import { getStatus, initStore } from './store'
import * as repository from './repository'
import { searchGlobal } from './search'
import { listCustomPrompts, resetCustomPrompt, saveCustomPrompt } from '../prompts'

/**
 * Registra un canal db:* que SIEMPRE resuelve con el envelope DbResult: la
 * promesa nunca se rechaza (Electron pierde el `kind` tipado al serializar
 * rejections), los fallos viajan como { ok: false, error }.
 */
function handleDb<Args extends unknown[], T>(
  channel: string,
  operation: (...args: Args) => T
): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]): DbResult<T> => {
    try {
      return { ok: true, data: operation(...(args as Args)) }
    } catch (error) {
      return { ok: false, error: toDbError(error) }
    }
  })
}

/** Inicializa el almacén JSON y registra todos los canales db:* (SPEC-006). */
export function registerDbIpcHandlers(): void {
  initStore()

  handleDb('db:get-status', getStatus)

  handleDb('db:discovery:create', repository.createDiscovery)
  handleDb('db:discovery:list', repository.listDiscoveries)
  handleDb('db:discovery:get', repository.getDiscovery)
  handleDb('db:discovery:update', repository.updateDiscovery)
  handleDb('db:discovery:delete', repository.deleteDiscovery)

  handleDb('db:company:create', repository.createCompany)
  handleDb('db:company:list', repository.listCompanies)
  handleDb('db:company:get', repository.getCompany)
  handleDb('db:company:update', repository.updateCompany)
  handleDb('db:company:delete', repository.deleteCompany)

  handleDb('db:contact:create', repository.createContact)
  handleDb('db:contact:list', repository.listContacts)
  handleDb('db:contact:get', repository.getContact)
  handleDb('db:contact:update', repository.updateContact)
  handleDb('db:contact:delete', repository.deleteContact)

  handleDb('db:interview-template:create', repository.createInterviewTemplate)
  handleDb('db:interview-template:list', repository.listInterviewTemplates)
  handleDb('db:interview-template:get', repository.getInterviewTemplate)
  handleDb('db:interview-template:update', repository.updateInterviewTemplate)
  handleDb('db:interview-template:delete', repository.deleteInterviewTemplate)

  handleDb('db:interview:create', repository.createInterview)
  handleDb('db:interview:list', repository.listInterviews)
  handleDb('db:interview:get', repository.getInterview)
  handleDb('db:interview:update', repository.updateInterview)
  handleDb('db:interview:delete', repository.deleteInterview)
  // Capture-first (SPEC-020): listado global + asignación compuesta atómica.
  handleDb('db:interview:list-all', repository.listAllInterviews)
  handleDb('db:interview:assign-company', repository.assignInterviewCompany)
  // Motivos de las preguntas descartadas del asistente (SPEC-039): única
  // escritura de questionOutcomes expuesta por IPC (solo rellena `reason`).
  handleDb('db:set-discard-reasons', repository.setInterviewDiscardReasons)

  handleDb('db:note-template:create', repository.createNoteTemplate)
  handleDb('db:note-template:list', repository.listNoteTemplates)
  handleDb('db:note-template:get', repository.getNoteTemplate)
  handleDb('db:note-template:update', repository.updateNoteTemplate)
  handleDb('db:note-template:delete', repository.deleteNoteTemplate)

  // Búsqueda global (SPEC-018): resultados agrupados con contexto resuelto.
  handleDb('db:search', searchGlobal)

  // Ajustes de coste de IA (SPEC-021): singleton get/set con envelope DbResult.
  handleDb('db:ai-cost-settings:get', repository.getAiCostSettings)
  handleDb('db:ai-cost-settings:set', repository.setAiCostSettings)

  // Ajustes del asistente en vivo (SPEC-036): tamaño de la cola de preguntas.
  handleDb('db:assistant-settings:get', repository.getAssistantSettings)
  handleDb('db:assistant-settings:set', repository.setAssistantSettings)

  // Prompts de IA personalizables (SPEC-026): catálogo fijo, override→default.
  handleDb('db:custom-prompt:list', listCustomPrompts)
  handleDb('db:custom-prompt:save', saveCustomPrompt)
  handleDb('db:custom-prompt:reset', resetCustomPrompt)

  handleDb('db:note:create', repository.createNote)
  handleDb('db:note:get-by-interview', repository.getNoteByInterview)
  handleDb('db:note:update', repository.updateNote)
  handleDb('db:note:delete', repository.deleteNote)
}
