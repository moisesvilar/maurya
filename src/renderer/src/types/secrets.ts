/**
 * Tipos compartidos de la gestión de claves de IA (SPEC-007): estado de las
 * claves, errores tipados y el contrato del bridge `api.secrets`.
 * Este módulo NO debe depender del DOM: lo importan (type-only) main y preload.
 *
 * Invariante de seguridad: NINGÚN tipo de este contrato transporta la clave en
 * claro desde main hacia el renderer; el valor solo viaja renderer → main en
 * `save` y main lo persiste cifrado con safeStorage.
 */

/**
 * Proveedores cuya clave gestiona la página de Ajustes. 'linkedinMcp' es el
 * token de autorización del servidor MCP de LinkedIn (p. ej. Apify); su URL
 * (que no es secreto) vive en db.json como LinkedinMcpSettings.
 */
export type SecretKind = 'deepgram' | 'anthropic' | 'linkedinMcp'

/** Estado visible de una clave: nunca incluye el valor, solo sus últimos 4. */
export interface KeyStatus {
  configured: boolean
  last4: string | null
}

/** Snapshot devuelto por `secrets:get-status`. */
export interface SecretsStatus {
  /** true si safeStorage puede cifrar en este equipo (Keychain en macOS). */
  available: boolean
  deepgram: KeyStatus
  anthropic: KeyStatus
  linkedinMcp: KeyStatus
}

export type SecretsErrorKind = 'validation' | 'encryption-unavailable' | 'storage'

export interface SecretsError {
  kind: SecretsErrorKind
  message: string
}

/**
 * Envelope de TODA operación de `api.secrets` (mismo patrón que DbResult): las
 * promesas del bridge nunca se rechazan; los fallos viajan como valor tipado.
 */
export type SecretsResult<T> = { ok: true; data: T } | { ok: false; error: SecretsError }

/** API expuesta por el preload en `window.api.secrets`. */
export interface SecretsApi {
  getStatus: () => Promise<SecretsResult<SecretsStatus>>
  save: (kind: SecretKind, value: string) => Promise<SecretsResult<KeyStatus>>
  remove: (kind: SecretKind) => Promise<SecretsResult<KeyStatus>>
}
