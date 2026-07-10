import React, { useEffect, useState } from 'react'
import { FileText, Loader2, Pencil, Plus, RefreshCw, Sparkles, Target, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MarkdownEditor } from '@/components/markdown/MarkdownEditor'
import { MarkdownView } from '@/components/markdown/MarkdownView'
import type { Interview } from '@/types/domain'

type KeyStatus = 'loading' | 'ok' | 'missing'

interface ScriptSectionProps {
  interview: Interview
  onInterviewUpdated: (interview: Interview) => void
}

/**
 * Sección Guión del detalle de entrevista (SPEC-014): generación con Claude
 * (main process), visualización del guión renderizado como Markdown
 * (MarkdownView) + lista de objetivos, y edición manual con editor WYSIWYG
 * (MarkdownEditor, SPEC-027; Riesgo #6: control humano). Estado local, sin
 * hook aparte (único consumidor). Prerrequisitos de generación (template
 * asignado y clave de Anthropic) deshabilitan el botón con Tooltip/Alert;
 * regenerar y descartar cambios piden confirmación con AlertDialog. El editor
 * solo emite onChange en ediciones reales, así el dirty-check compara contra
 * el string persistido sin falsos positivos por normalización.
 */
export function ScriptSection({
  interview,
  onInterviewUpdated
}: ScriptSectionProps): React.ReactElement {
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('loading')
  const [generating, setGenerating] = useState(false)
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [scriptDraft, setScriptDraft] = useState('')
  const [objectivesDraft, setObjectivesDraft] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // setState en el callback de la promesa, nunca síncrono en el efecto
  // (patrón InterviewDetailPage / react-hooks/set-state-in-effect).
  useEffect(() => {
    void window.api.llm.getStatus().then((result) => {
      setKeyStatus(result.ok && result.data.hasAnthropicKey ? 'ok' : 'missing')
    })
  }, [])

  const hasTemplate = interview.templateId !== null
  const hasScript = interview.scriptMarkdown !== null
  const canGenerate = hasTemplate && keyStatus === 'ok' && !generating

  /** Motivo de deshabilitado del botón Generar (Tooltip); null si está habilitado. */
  const disabledReason = !hasTemplate
    ? 'Asigna un template para generar el guión'
    : keyStatus !== 'ok'
      ? 'Configura tu clave de Anthropic en Ajustes para generar el guión'
      : null

  const handleGenerate = async (): Promise<void> => {
    setGenerating(true)
    try {
      const result = await window.api.llm.generateScript(interview.id)
      if (result.ok) {
        onInterviewUpdated(result.data)
        toast('Guión generado')
      } else {
        toast.error(result.error.message)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleStartEdit = (): void => {
    setScriptDraft(interview.scriptMarkdown ?? '')
    setObjectivesDraft([...interview.objectives])
    setMode('edit')
  }

  const isDirty = (): boolean =>
    scriptDraft !== (interview.scriptMarkdown ?? '') ||
    objectivesDraft.length !== interview.objectives.length ||
    objectivesDraft.some((objective, index) => objective !== interview.objectives[index])

  const handleCancelEdit = (): void => {
    if (isDirty()) {
      setConfirmDiscard(true)
      return
    }
    setMode('read')
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      // Los objetivos vacíos se descartan silenciosamente (AC de edición)
      const objectives = objectivesDraft.map((item) => item.trim()).filter((item) => item !== '')
      const result = await window.api.db.updateInterview(interview.id, {
        scriptMarkdown: scriptDraft,
        objectives
      })
      if (result.ok) {
        onInterviewUpdated(result.data)
        toast('Cambios guardados')
        setMode('read')
      } else {
        toast.error(result.error.message)
      }
    } finally {
      setSaving(false)
    }
  }

  /** Botón Generar/estado de carga; con Tooltip cuando está deshabilitado por prerrequisito. */
  const generateButton = (label: string): React.ReactElement => {
    const button = (
      <Button disabled={!canGenerate} onClick={() => void handleGenerate()}>
        {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {generating ? 'Generando guión…' : label}
      </Button>
    )
    if (disabledReason === null) {
      return button
    }
    return (
      <Tooltip>
        {/* span intermedio: los elementos disabled no disparan eventos de hover */}
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Guión</h3>
        {mode === 'read' && !hasScript && generateButton('Generar guión')}
        {mode === 'read' && hasScript && !generating && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleStartEdit}>
              <Pencil />
              Editar
            </Button>
            <Button
              variant="outline"
              disabled={!hasTemplate || keyStatus !== 'ok'}
              onClick={() => setConfirmRegenerate(true)}
            >
              <RefreshCw />
              Regenerar
            </Button>
          </div>
        )}
        {mode === 'read' && hasScript && generating && (
          <Button variant="outline" disabled>
            <Loader2 className="animate-spin" />
            Generando guión…
          </Button>
        )}
      </div>

      {keyStatus === 'missing' && (
        <Alert>
          <Sparkles aria-hidden="true" />
          <AlertDescription>
            Configura tu clave de Anthropic en{' '}
            <Link to="/settings" className="font-medium underline underline-offset-4">
              Ajustes
            </Link>{' '}
            para generar el guión
          </AlertDescription>
        </Alert>
      )}

      {mode === 'read' && !hasScript && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Aún no hay guión</p>
          {canGenerate && (
            <Button onClick={() => void handleGenerate()}>
              <Sparkles />
              Generar guión
            </Button>
          )}
        </div>
      )}

      {mode === 'read' && hasScript && (
        <div className="flex flex-col gap-4">
          <MarkdownView markdown={interview.scriptMarkdown ?? ''} testId="script-markdown-view" />
          <div className="flex flex-col gap-2">
            <h4 className="text-base font-semibold">Objetivos</h4>
            {interview.objectives.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {interview.objectives.map((objective, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <Target
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin objetivos</p>
            )}
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="flex flex-col gap-4">
          <MarkdownEditor
            initialMarkdown={interview.scriptMarkdown ?? ''}
            onChange={setScriptDraft}
            ariaLabel="Guión"
            testId="script-markdown-editor"
          />
          <div className="flex flex-col gap-2">
            <h4 className="text-base font-semibold">Objetivos</h4>
            {objectivesDraft.map((objective, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={objective}
                  onChange={(event) =>
                    setObjectivesDraft((draft) =>
                      draft.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item
                      )
                    )
                  }
                  aria-label={`Objetivo ${index + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar objetivo"
                  onClick={() =>
                    setObjectivesDraft((draft) =>
                      draft.filter((_item, itemIndex) => itemIndex !== index)
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="outline"
                onClick={() => setObjectivesDraft((draft) => [...draft, ''])}
              >
                <Plus />
                Añadir objetivo
              </Button>
            </div>
          </div>
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background py-3">
            <Button variant="outline" disabled={saving} onClick={handleCancelEdit}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void handleSave()}>
              {saving && <Loader2 className="animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerar guión</AlertDialogTitle>
            <AlertDialogDescription>
              Se sobrescribirán el guión y los objetivos actuales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRegenerate(false)
                void handleGenerate()
              }}
            >
              Regenerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar cambios</AlertDialogTitle>
            <AlertDialogDescription>
              Los cambios sin guardar del guión y los objetivos se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false)
                setMode('read')
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
