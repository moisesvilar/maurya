import { ElectronAPI } from '@electron-toolkit/preload'
import type { MauryaApi } from '../renderer/src/types/audio'
import type { DbApi } from '../renderer/src/types/domain'
import type { SecretsApi } from '../renderer/src/types/secrets'

declare global {
  interface Window {
    electron: ElectronAPI
    api: MauryaApi & { db: DbApi; secrets: SecretsApi }
  }
}
