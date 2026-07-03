import { ElectronAPI } from '@electron-toolkit/preload'
import type { MauryaApi } from '../renderer/src/types/audio'
import type { DbApi } from '../renderer/src/types/domain'

declare global {
  interface Window {
    electron: ElectronAPI
    api: MauryaApi & { db: DbApi }
  }
}
