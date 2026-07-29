import { BrowserWindow } from 'electron'
import type { Interview } from '../renderer/src/types/domain'

/**
 * Difusión de eventos push a todas las ventanas (SPEC-062): el bucle que ya
 * usaba `scriptAutoGenerationService` para `llm:script-generation`, extraído
 * para compartirlo con la señal nueva del guión.
 */
export function broadcastToAllWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

/**
 * Anuncia que la entrevista se ha persistido por un camino que toca el guión
 * (SPEC-062): guardado manual del editor y generación manual. Señal NUEVA y
 * dedicada en lugar de reutilizar `llm:script-generation`, que MEMORY.md
 * (SPEC-058-iter-1) descartó para el camino manual porque obligaría a
 * `ScriptSection` a deduplicar toasts y a proteger el remontaje del editor
 * frente a eventos que ella misma provocó. Aquí el riesgo de regresión es
 * cero: la ventana principal no la escucha en ningún componente — solo lo hace
 * la ventana desacoplada del guión.
 */
export function broadcastInterviewUpdated(interview: Interview): void {
  broadcastToAllWindows('db:interview-updated', interview)
}
