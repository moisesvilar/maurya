import { readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Carga `.env.local` (formato KEY=value) en process.env sin depender de dotenv.
 * Se llama en el main process antes de app.whenReady(). NUNCA usar
 * import.meta.env para secretos: los inlinaría en el bundle.
 */
export function loadLocalEnv(): void {
  // userData primero: en la app empaquetada getAppPath() apunta dentro del asar
  // (solo lectura), así que la key vive en ~/Library/Application Support/Maurya/.env.local
  const candidates = [
    join(app.getPath('userData'), '.env.local'),
    join(app.getAppPath(), '.env.local'),
    join(process.cwd(), '.env.local')
  ]
  for (const filePath of candidates) {
    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    applyEnvContent(content)
    return
  }
}

/** Parser mínimo: líneas KEY=value, comillas envolventes y comentarios (#). */
function applyEnvContent(content: string): void {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) {
      continue
    }
    const separator = line.indexOf('=')
    if (separator <= 0) {
      continue
    }
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
