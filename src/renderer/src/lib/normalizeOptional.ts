/**
 * Normaliza un campo de texto opcional de formulario antes del bridge
 * (SPEC-011, contrato SPEC-006): vacío o solo espacios → null; si hay
 * contenido, se guarda recortado. El sentido inverso (null → '' para
 * precargar Inputs) lo resuelven los dialogs con `?? ''`.
 */
export function normalizeOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
