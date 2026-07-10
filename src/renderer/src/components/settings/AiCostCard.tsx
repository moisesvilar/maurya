import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

/**
 * Card "Coste de IA" de Ajustes (SPEC-021): límite de gasto estimado por
 * entrevista para el asistente en vivo (vacío = sin límite). Mismo patrón de
 * interacción que las cards de claves de SPEC-007: form real con validación
 * inline on submit y Toast en éxito. La validación normaliza la coma decimal
 * (teclado es-ES) antes de parsear.
 */
export function AiCostCard(): React.ReactElement {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Guard de doble submit (SPEC-024): botón disabled + spinner mientras persiste. */
  const [submitting, setSubmitting] = useState(false)

  // Precarga del límite persistido; mientras carga, el input queda disabled.
  // Un ajuste ilegible viaja normalizado desde main como "sin límite".
  useEffect(() => {
    let cancelled = false
    void window.api.db.getAiCostSettings().then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok && result.data.limitUsd !== null) {
        setValue(String(result.data.limitUsd))
      }
      setLoading(false)
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = value.trim()
    let limitUsd: number | null = null
    if (trimmed !== '') {
      const parsed = Number(trimmed.replace(',', '.'))
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Introduce un importe positivo o deja el campo vacío')
        return
      }
      limitUsd = parsed
    }
    setError(null)
    setSubmitting(true)
    void window.api.db.setAiCostSettings({ limitUsd }).then((result) => {
      setSubmitting(false)
      if (result.ok) {
        toast('Ajustes guardados')
      } else {
        toast.error(result.error.message)
      }
    })
  }

  return (
    <Card data-testid="ai-cost-settings-card">
      <CardHeader>
        <CardTitle>Coste de IA</CardTitle>
        <CardDescription>
          Límite de gasto estimado por entrevista para el asistente en vivo. El guión y la nota no
          se bloquean.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <label className="text-sm font-medium" htmlFor="ai-cost-limit-input">
            Límite por entrevista (USD)
          </label>
          {/* Mobile apila en columna; desktop input + Guardar en fila */}
          <div className="flex flex-col gap-2 md:flex-row md:items-start">
            <Input
              id="ai-cost-limit-input"
              data-testid="ai-cost-limit-input"
              inputMode="decimal"
              placeholder="Sin límite"
              value={value}
              disabled={loading}
              aria-invalid={error !== null}
              onChange={(event) => {
                setValue(event.target.value)
                if (error !== null) {
                  setError(null)
                }
              }}
            />
            <Button type="submit" disabled={loading || submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Guardar
            </Button>
          </div>
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-sm text-muted-foreground">
            Coste estimado según la tarifa del modelo configurado en la app; orientativo, no factura
            real.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
