import { app, shell, BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { LOOPBACK_FEATURE_FLAGS, registerLoopbackHandler } from './loopbackHandler'
import { registerIpcHandlers } from './ipc'
import { isRecordingActive } from './wavFileService'
import { loadLocalEnv } from './env'

// Flags Chromium de loopback de audio macOS: SIEMPRE antes de app.whenReady()
app.commandLine.appendSwitch('enable-features', LOOPBACK_FEATURE_FLAGS)

// DEEPGRAM_API_KEY desde .env.local: solo vive en el main process
loadLocalEnv()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 720,
    height: 640,
    minWidth: 720,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Maurya — Spike captura de audio',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  registerLoopbackHandler(mainWindow.webContents.session)

  // Close guard: si hay captura en curso, se delega la decisión al renderer
  // (AlertDialog "Detener captura") y solo se cierra tras confirmación.
  let forceClose = false
  const onConfirmClose = (event: IpcMainEvent): void => {
    if (event.sender === mainWindow.webContents) {
      forceClose = true
      mainWindow.close()
    }
  }
  ipcMain.on('window:confirm-close', onConfirmClose)

  mainWindow.on('close', (event) => {
    if (!forceClose && isRecordingActive()) {
      event.preventDefault()
      mainWindow.webContents.send('window:close-requested')
    }
  })

  mainWindow.on('closed', () => {
    ipcMain.removeListener('window:confirm-close', onConfirmClose)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.maurya')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
