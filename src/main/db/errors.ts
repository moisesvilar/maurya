import type { DbError, DbErrorKind } from '../../renderer/src/types/domain'

/**
 * Error interno de la capa de persistencia (SPEC-006). Lleva el `kind` tipado
 * del contrato; el bridge lo aplana a `DbError` dentro del envelope `DbResult`.
 */
export class DbOperationError extends Error {
  readonly kind: DbErrorKind

  constructor(kind: DbErrorKind, message: string) {
    super(message)
    this.name = 'DbOperationError'
    this.kind = kind
  }

  toDbError(): DbError {
    return { kind: this.kind, message: this.message }
  }
}

export function validationError(message: string): DbOperationError {
  return new DbOperationError('validation', message)
}

export function notFoundError(message: string): DbOperationError {
  return new DbOperationError('not-found', message)
}

export function referenceError(message: string): DbOperationError {
  return new DbOperationError('reference', message)
}

export function storageError(message: string): DbOperationError {
  return new DbOperationError('storage', message)
}

/** Aplana cualquier error a DbError; lo no tipado se reporta como `storage`. */
export function toDbError(error: unknown): DbError {
  if (error instanceof DbOperationError) {
    return error.toDbError()
  }
  const message = error instanceof Error ? error.message : String(error)
  return { kind: 'storage', message }
}
