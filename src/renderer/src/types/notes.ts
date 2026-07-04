/**
 * Tipos del bridge de exportación de la nota y la transcripción a Markdown
 * (SPEC-017). Este módulo NO debe depender del DOM: lo importan (type-only)
 * main y preload. El diálogo de guardado del sistema vive en main; por aquí
 * solo viajan el interviewId, el destino y resultados tipados.
 */

/** Documento a exportar: la nota o la transcripción de la entrevista. */
export type NoteExportTarget = 'note' | 'transcript'

/**
 * Desenlace de una exportación sin error: `saved: false` significa que el
 * usuario canceló el diálogo de guardado (resultado neutro, sin Toast).
 */
export interface NoteExportOutcome {
  saved: boolean
  /** Ruta del archivo escrito; null si el usuario canceló. */
  filePath: string | null
}

export type NoteExportErrorKind = 'not-found' | 'no-content' | 'write'

export interface NoteExportError {
  kind: NoteExportErrorKind
  message: string
}

/**
 * Envelope de TODA operación de `api.notes` (patrón DbResult de SPEC-006): las
 * promesas del bridge nunca se rechazan (Electron pierde el `kind` al
 * serializar rejections); los fallos viajan como `{ ok: false, error }`.
 */
export type NoteExportResult =
  { ok: true; data: NoteExportOutcome } | { ok: false; error: NoteExportError }

/** API expuesta por el preload en `window.api.notes`. */
export interface NotesApi {
  /** Exporta la nota o la transcripción como Markdown vía save dialog del SO. */
  export: (interviewId: string, target: NoteExportTarget) => Promise<NoteExportResult>
}
