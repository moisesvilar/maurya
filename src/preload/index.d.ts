import { ElectronAPI } from '@electron-toolkit/preload'
import type { MauryaApi } from '../renderer/src/types/audio'

declare global {
  interface Window {
    electron: ElectronAPI
    api: MauryaApi
  }
}
