/**
 * Formato del coste de IA (SPEC-021). Decisión de la spec: USD (moneda de
 * facturación de Anthropic), prefijo "~$" (estimación, no factura real) y
 * 2 decimales.
 */
export function formatUsd(value: number): string {
  return `~$${value.toFixed(2)}`
}

/** Recuento compacto de tokens para el desglose del Tooltip: 12345 → "12.3k". */
export function formatTokenCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}
