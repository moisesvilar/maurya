import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

/** Opciones cerradas del tamaño de cola (SPEC-036): Select 1–5, regla 4.4. */
const QUEUE_SIZE_OPTIONS = ['1', '2', '3', '4', '5'] as const

/**
 * Card "Asistente en vivo" de Ajustes (SPEC-036): tamaño de la cola de
 * preguntas pendientes del asistente (default 3). Guardado inmediato al
 * cambiar el Select + Toast «Ajustes guardados» (misma mecánica que la card
 * de coste de IA, sin botón Guardar: el Select ES el commit). Un cambio a
 * mitad de sesión aplica a la siguiente (main lee el ajuste al arrancar).
 */
export function AssistantSettingsCard(): React.ReactElement {
  const [value, setValue] = useState('3')
  const [loading, setLoading] = useState(true)
  /** Guard de escritura en curso (patrón SPEC-024): Select disabled mientras persiste. */
  const [saving, setSaving] = useState(false)

  // Precarga del tamaño persistido; mientras carga, el Select queda disabled.
  // Un almacén ilegible o sin dato viaja normalizado desde main como default 3.
  useEffect(() => {
    let cancelled = false
    void window.api.db.getAssistantSettings().then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok) {
        setValue(String(result.data.queueSize))
      }
      setLoading(false)
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  const handleChange = (next: string): void => {
    setValue(next)
    setSaving(true)
    // El Select de shadcn trabaja con string; el contrato pide entero 1–5
    void window.api.db.setAssistantSettings({ queueSize: Number(next) }).then((result) => {
      setSaving(false)
      if (result.ok) {
        toast('Ajustes guardados')
      } else {
        toast.error(result.error.message)
      }
    })
  }

  return (
    <Card data-testid="assistant-settings-card">
      <CardHeader>
        <CardTitle>Asistente en vivo</CardTitle>
        <CardDescription>
          Número máximo de preguntas pendientes visibles a la vez durante la entrevista.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <Label htmlFor="assistant-queue-size-select">Tamaño de la cola de preguntas</Label>
          <Select value={value} onValueChange={handleChange} disabled={loading || saving}>
            <SelectTrigger
              id="assistant-queue-size-select"
              data-testid="assistant-queue-size-select"
              className="w-full md:w-32"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUEUE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
