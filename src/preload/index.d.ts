import { ElectronAPI } from '@electron-toolkit/preload'
import type { MauryaApi } from '../renderer/src/types/audio'
import type { DbApi } from '../renderer/src/types/domain'
import type { SecretsApi } from '../renderer/src/types/secrets'
import type { LlmApi } from '../renderer/src/types/llm'
import type { NotesApi } from '../renderer/src/types/notes'
import type { AssistantApi } from '../renderer/src/types/assistant'

declare global {
  interface Window {
    electron: ElectronAPI
    api: MauryaApi & {
      db: DbApi
      secrets: SecretsApi
      llm: LlmApi
      notes: NotesApi
      assistant: AssistantApi
    }
  }
}
