import type { BrowserWindow, WebContents } from 'electron'
import type { DetachedComponent } from '../renderer/src/types/detached'

/**
 * Registro de las ventanas desacopladas vivas (SPEC-062). Módulo PURO: los
 * imports de electron son `import type` (se borran al compilar) y aquí no se
 * llama a ninguna API de Electron.
 *
 * Esa pureza es el motivo de que el registro viva separado de
 * `detachedWindows.ts`: `assistantService` necesita saber a quién difundir
 * `assistant:update` y lo consulta por aquí, SIN arrastrar `electron` a su
 * grafo de módulos (11 suites de main mockean `electron` sin `BrowserWindow`;
 * un `BrowserWindow.getAllWindows()` en el camino de emisión las rompería en
 * bloque). En tests el Map está vacío y la difusión degrada a no-op.
 *
 * Clave = el COMPONENTE, no el par componente+entrevista: solo hay una
 * grabación viva a la vez, así que no puede haber dos entrevistas en juego y
 * una clave compuesta solo permitiría ventanas huérfanas de otra entrevista.
 */

const detachedWindows = new Map<DetachedComponent, BrowserWindow>()

/** Ventana desacoplada viva de ese componente; `null` si no hay o está destruida. */
export function getDetachedWindow(component: DetachedComponent): BrowserWindow | null {
  const window = detachedWindows.get(component)
  if (window === undefined || window.isDestroyed()) {
    return null
  }
  return window
}

/** Da de alta la ventana del componente (reemplaza la anterior si la hubiera). */
export function registerDetachedWindow(component: DetachedComponent, window: BrowserWindow): void {
  detachedWindows.set(component, window)
}

/** Da de baja la ventana del componente. Idempotente. */
export function unregisterDetachedWindow(component: DetachedComponent): void {
  detachedWindows.delete(component)
}

/** Ventanas desacopladas vivas (las destruidas se filtran). */
export function listDetachedWindows(): BrowserWindow[] {
  return Array.from(detachedWindows.values()).filter((window) => !window.isDestroyed())
}

/**
 * `WebContents` vivos de las ventanas desacopladas: destinatarios de la
 * difusión de eventos del asistente (SPEC-062). Filtra tanto la ventana como
 * el webContents destruidos — durante el cierre pueden ir por separado.
 */
export function listDetachedWebContents(): WebContents[] {
  return listDetachedWindows()
    .map((window) => window.webContents)
    .filter((webContents) => !webContents.isDestroyed())
}

/** Vacía el registro (cierre de todas las ventanas desacopladas / tests). */
export function clearDetachedRegistry(): void {
  detachedWindows.clear()
}
