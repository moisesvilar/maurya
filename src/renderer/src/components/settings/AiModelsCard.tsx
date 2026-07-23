import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  AI_MODEL_IDS,
  AI_TASK_IDS,
  DEFAULT_AI_TASK_SETTINGS,
  type AiModelId,
  type AiTaskId,
  type AiTaskSettings
} from '@/types/domain'

/** Etiquetas de los modelos, en orden de coste ascendente. */
const MODEL_LABELS: Record<AiModelId, string> = {
  'claude-haiku-4-5': 'Haiku 4.5 — rápido y económico',
  'claude-sonnet-5': 'Sonnet 5 — equilibrado',
  'claude-opus-4-8': 'Opus 4.8 — máxima calidad'
}

/** Etiqueta y descripción corta de cada tarea, para la fila de la card. */
const TASK_LABELS: Record<AiTaskId, { title: string; description: string }> = {
  assistantInteractive: {
    title: 'Asistente en vivo — sugerencias',
    description: 'Siguiente pregunta, alarmas y cursor de guión durante la entrevista'
  },
  assistantMaintenance: {
    title: 'Asistente en vivo — cola y objetivos',
    description: 'Resolución automática de la cola y seguimiento de objetivos'
  },
  scriptGeneration: {
    title: 'Generación de guión y objetivos',
    description: 'Guión personalizado y objetivos de la entrevista'
  },
  noteGeneration: {
    title: 'Nota de resumen',
    description: 'Nota post-entrevista a partir de la transcripción'
  },
  objectiveEvaluation: {
    title: 'Evaluación de objetivos',
    description: 'Cumplimiento de objetivos tras la grabación'
  },
  companyContext: {
    title: 'Contexto de empresa',
    description: 'Resumen desde la web y LinkedIn de la empresa'
  },
  contactContext: {
    title: 'Contexto de contacto',
    description: 'Resumen desde el LinkedIn del contacto'
  }
}

/**
 * Card "Modelos de IA" de Ajustes (revisión de coste 2026-07): modelo y
 * thinking por tarea, con guardado inmediato al cambiar (patrón
 * AssistantSettingsCard: el control ES el commit + toast). Un cambio a mitad
 * de sesión del asistente aplica a la siguiente (main lee al arrancar).
 */
export function AiModelsCard(): React.ReactElement {
  const [settings, setSettings] = useState<AiTaskSettings>(DEFAULT_AI_TASK_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.db.getAiTaskSettings().then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok) {
        setSettings(result.data)
      }
      setLoading(false)
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  const persist = (next: AiTaskSettings): void => {
    setSettings(next)
    setSaving(true)
    void window.api.db.setAiTaskSettings(next).then((result) => {
      setSaving(false)
      if (result.ok) {
        setSettings(result.data)
        toast('Ajustes guardados')
      } else {
        toast.error(result.error.message)
      }
    })
  }

  const disabled = loading || saving

  return (
    <Card data-testid="ai-models-card">
      <CardHeader>
        <CardTitle>Modelos de IA</CardTitle>
        <CardDescription>
          Modelo y thinking de cada tarea de IA. Los defaults equilibran coste y calidad: cambia una
          tarea solo si sabes lo que buscas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {AI_TASK_IDS.map((task) => {
            const config = settings[task]
            return (
              <div
                key={task}
                className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                data-testid={`ai-task-row-${task}`}
              >
                <div className="md:max-w-[46%]">
                  <Label htmlFor={`ai-task-model-${task}`}>{TASK_LABELS[task].title}</Label>
                  <p className="text-muted-foreground text-sm">{TASK_LABELS[task].description}</p>
                </div>
                <div className="flex items-center gap-4">
                  <Select
                    value={config.model}
                    onValueChange={(model) => {
                      persist({ ...settings, [task]: { ...config, model: model as AiModelId } })
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      id={`ai-task-model-${task}`}
                      data-testid={`ai-task-model-${task}`}
                      className="w-64"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_MODEL_IDS.map((model) => (
                        <SelectItem key={model} value={model}>
                          {MODEL_LABELS[model]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`ai-task-thinking-${task}`}
                      data-testid={`ai-task-thinking-${task}`}
                      checked={config.thinking}
                      onCheckedChange={(checked) => {
                        persist({
                          ...settings,
                          [task]: { ...config, thinking: checked === true }
                        })
                      }}
                      disabled={disabled}
                    />
                    <Label htmlFor={`ai-task-thinking-${task}`} className="font-normal">
                      Thinking
                    </Label>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
