import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { detachedWindowHash, type DetachedComponent } from '../renderer/src/types/detached'
import {
  getDetachedWindow,
  listDetachedWindows,
  clearDetachedRegistry,
  registerDetachedWindow,
  unregisterDetachedWindow
} from './detachedWindowRegistry'
import * as repository from './db/repository'

/**
 * Ciclo de vida de las ventanas desacopladas del asistente y del guión
 * (SPEC-059): creación, deduplicación por componente, título nativo y cierre.
 * El registro de quién está vivo vive aparte (`detachedWindowRegistry.ts`),
 * puro y sin `electron`, para que el asistente pueda difundir sus eventos sin
 * importar este módulo.
 *
 * Invariantes:
 * - Ventanas NORMALES: sin `alwaysOnTop` (el caso de uso es el mosaico, no la
 *   superposición flotante — territorio de SPEC-054) y sin `parent` (una hija
 *   se cerraría gratis con la principal pero quedaría siempre por encima de
 *   ella, justo lo contrario del mosaico). El ciclo de vida se hace explícito.
 * - No participan en la captura: sin close-guard y sin
 *   `registerLoopbackHandler` (que además es de SESIÓN, no de ventana, y ya lo
 *   registró la principal; estas ventanas nunca llaman a `getDisplayMedia`).
 */

/** Geometría por defecto y mínimos (SPEC-059), idénticos para ambos componentes. */
const WINDOW_WIDTH = 420
const WINDOW_HEIGHT = 640
const WINDOW_MIN_WIDTH = 360
const WINDOW_MIN_HEIGHT = 480

/** Prefijo del título nativo por componente; también es el fallback a secas. */
const TITLE_PREFIX: Record<DetachedComponent, string> = {
  assistant: 'Asistente',
  script: 'Guión'
}

/**
 * Título nativo «Asistente — {título}» / «Guión — {título}». El repositorio se
 * consulta con try/catch: una entrevista borrada o un almacén ilegible degrada
 * al prefijo a secas, jamás impide abrir la ventana.
 */
function buildTitle(component: DetachedComponent, interviewId: string): string {
  const prefix = TITLE_PREFIX[component]
  try {
    return `${prefix} — ${repository.getInterview(interviewId).title}`
  } catch {
    return prefix
  }
}

/**
 * Abre la ventana desacoplada del componente para esa entrevista, o enfoca la
 * existente (deduplicación por componente: un segundo clic nunca crea una
 * segunda copia del mismo espejo).
 */
export function openDetachedWindow(component: DetachedComponent, interviewId: string): void {
  const existing = getDetachedWindow(component)
  if (existing !== null) {
    if (existing.isMinimized()) {
      existing.restore()
    }
    existing.focus()
    return
  }

  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    title: buildTitle(component, interviewId),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // ANTES de la carga, sin excepción: `src/renderer/index.html` declara
  // <title>Maurya</title> y Chromium sobrescribe el título nativo con el del
  // documento en cuanto carga. La principal no lo sufre solo porque su título
  // coincide con el del documento.
  window.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  // El guión renderizado puede contener enlaces: fuera, al navegador (igual
  // que la ventana principal).
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  window.on('closed', () => {
    unregisterDetachedWindow(component)
  })

  registerDetachedWindow(component, window)

  // La ruta viaja en el hash porque el renderer usa HashRouter; el hash lo
  // construye el helper compartido con el router (fuente única de verdad).
  const hash = detachedWindowHash(component, interviewId)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#${hash}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

/**
 * Cierra todas las ventanas desacopladas y vacía el registro (SPEC-059).
 * Idempotente y tolerante a ventanas ya destruidas: se llama al parar la
 * grabación (síncrono y antes de cualquier await) y al cerrarse la principal.
 */
export function closeDetachedWindows(): void {
  for (const window of listDetachedWindows()) {
    window.close()
  }
  clearDetachedRegistry()
}
