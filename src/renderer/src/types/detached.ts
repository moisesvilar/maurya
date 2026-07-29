/**
 * Contrato de las ventanas desacopladas (SPEC-062): asistente y guión en
 * sendas `BrowserWindow` espejo durante la grabación. Este módulo NO depende
 * del DOM: lo importan main (para construir el hash de carga y validar el
 * payload del canal) y el renderer (para declarar las rutas), de modo que la
 * ruta sea una ÚNICA fuente de verdad — desincronizarlas sería un fallo mudo
 * (ventana en blanco o 404 dentro de la ventana secundaria).
 */

/** Componente que se puede desacoplar a su propia ventana (SPEC-062). */
export type DetachedComponent = 'assistant' | 'script'

/**
 * Validación en frontera del componente (SPEC-062): main recibe el payload del
 * canal `window:open-detached` como `unknown` y solo actúa si es uno de los
 * dos componentes conocidos (patrón `window:set-theme`).
 */
export function isDetachedComponent(value: unknown): value is DetachedComponent {
  return value === 'assistant' || value === 'script'
}

/**
 * Rutas del HashRouter de cada ventana desacoplada (SPEC-062). Viven FUERA del
 * `Layout` (sin sidebar ni top bar): la ventana secundaria es una vista
 * dedicada de consulta.
 */
export const DETACHED_ROUTES: Record<DetachedComponent, string> = {
  assistant: '/detached/assistant/:interviewId',
  script: '/detached/script/:interviewId'
}

/**
 * Hash (sin `#`) que main pasa a `loadURL`/`loadFile` para abrir la ventana en
 * la vista del componente. Gemelo exacto de DETACHED_ROUTES con el parámetro
 * ya resuelto.
 */
export function detachedWindowHash(component: DetachedComponent, interviewId: string): string {
  return `/detached/${component}/${interviewId}`
}
