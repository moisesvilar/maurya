import React, { useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
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
import type { Interview } from '@/types/domain'

type KeyStatus = 'loading' | 'ok' | 'missing'

interface ScriptSectionProps {
  interview: Interview
  onInterviewUpdated: (interview: Interview) => void
}

/**
 * Sección Guión del detalle de entrevista (SPEC-014): generación con Claude
 * (main process) y edición siempre activa (SPEC-029): con guión, el editor
 * WYSIWYG (MarkdownEditor, SPEC-027; Riesgo #6: control humano) y la lista
 * editable de objetivos están siempre visibles, sin modo lectura ni botón
 * "Editar" (los objetivos de lectura viven en ObjectivesSection — SPEC-025).
 * "Guardar"/"Descartar" solo aparecen con cambios: el editor solo emite
 * onChange en ediciones reales, así el dirty-check compara contra los valores
 * persistidos sin falsos positivos por normalización (drafts null = prístino,
 * nunca inicializados en efectos). El contenido del editor solo se resetea
 * remontándolo (key por contador) en descarte confirmado y regeneración con
 * éxito; tras "Guardar" NO se remonta — el contenido ya es el persistido y así
 * se conservan foco y caret. Estado local, sin hook aparte (único consumidor).
 * Prerrequisitos de generación (template asignado y clave de Anthropic)
 * deshabilitan los botones con Tooltip/Alert; regenerar y descartar cambios
 * piden confirmación con AlertDialog.
 */
export function ScriptSection({
  interview,
  onInterviewUpdated
}: ScriptSectionProps): React.ReactElement {
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('loading')
  const [generating, setGenerating] = useState(false)
  // Autogeneración al crear la captura (SPEC-033): estado gobernado por los
  // eventos `llm:script-generation` de main, nunca por el invoke manual.
  const [autoGenerating, setAutoGenerating] = useState(false)
  // null = prístino: el editor/lista no han recibido ninguna edición real
  // desde el último reset; mientras tanto la UI sigue a la prop `interview`.
  const [scriptDraft, setScriptDraft] = useState<string | null>(null)
  const [objectivesDraft, setObjectivesDraft] = useState<string[] | null>(null)
  // Key del MarkdownEditor: incrementarla remonta el editor con el contenido
  // persistido (única forma de resetear TipTap). Solo en descarte/regeneración.
  const [editorResetKey, setEditorResetKey] = useState(0)
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

  // Autogeneración (SPEC-033): la identidad del callback del padre no debe
  // re-suscribir (ref, patrón ObjectivesSection).
  const onInterviewUpdatedRef = useRef(onInterviewUpdated)
  useEffect(() => {
    onInterviewUpdatedRef.current = onInterviewUpdated
  }, [onInterviewUpdated])

  const interviewId = interview.id
  useEffect(() => {
    // Carrera aceptada (plan, decisión 6): si `done` llega antes del mount, el
    // getInterview inicial ya trae el guión (autoGenerating arranca false); si
    // el mount cae entre `generating` y `done`, el spinner no aparece en esa
    // ventana de ms pero done/error llegan igualmente — jamás queda colgado.
    return window.api.llm.onScriptGeneration((event) => {
      if (event.interviewId !== interviewId) {
        return
      }
      if (event.status === 'generating') {
        setAutoGenerating(true)
        return
      }
      setAutoGenerating(false)
      if (event.status === 'done') {
        // NO se tocan editorResetKey ni drafts: el done automático solo ocurre
        // sin guión previo (guard de main), con el editor aún sin montar y los
        // drafts prístinos. Sin Toast de éxito: el guión apareciendo es el
        // feedback (criterio SPEC-025).
        onInterviewUpdatedRef.current(event.interview)
        return
      }
      toast.error(event.message)
    })
  }, [interviewId])

  const hasTemplate = interview.templateId !== null
  const hasScript = interview.scriptMarkdown !== null
  // Un solo indicador visual para la generación manual (invoke) y la
  // automática (eventos, SPEC-033).
  const isGenerating = generating || autoGenerating
  const canGenerate = hasTemplate && keyStatus === 'ok' && !isGenerating

  const persistedScript = interview.scriptMarkdown ?? ''
  const scriptDirty = scriptDraft !== null && scriptDraft !== persistedScript
  const objectivesDirty =
    objectivesDraft !== null &&
    (objectivesDraft.length !== interview.objectives.length ||
      objectivesDraft.some((objective, index) => objective !== interview.objectives[index]))
  const isDirty = scriptDirty || objectivesDirty
  const displayedObjectives = objectivesDraft ?? interview.objectives

  /** Motivo de deshabilitado de la generación (Tooltip); null si está habilitada. */
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
        // Reset a prístino + remontaje del editor con el guión nuevo (mismo
        // callback → un solo re-render por batching de React 19).
        setScriptDraft(null)
        setObjectivesDraft(null)
        setEditorResetKey((key) => key + 1)
        toast('Guión generado')
      } else {
        toast.error(result.error.message)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      // Los objetivos vacíos se descartan silenciosamente (AC de edición)
      const objectives = (objectivesDraft ?? interview.objectives)
        .map((item) => item.trim())
        .filter((item) => item !== '')
      const result = await window.api.db.updateInterview(interview.id, {
        scriptMarkdown: scriptDraft ?? persistedScript,
        objectives
      })
      if (result.ok) {
        onInterviewUpdated(result.data)
        // El filtrado de vacíos puede hacer que lo persistido difiera del
        // draft (['a',''] → ['a']): sin este reset la barra quedaría visible.
        setObjectivesDraft(null)
        // scriptDraft y la key NO se tocan: el dirty por comparación ya da
        // false y el editor no se remonta (foco y caret intactos).
        toast('Cambios guardados')
      } else {
        toast.error(result.error.message)
      }
    } finally {
      setSaving(false)
    }
  }

  /** Envuelve un botón deshabilitado con su Tooltip explicativo (regla 5.4). */
  const withTooltip = (button: React.ReactElement, reason: string | null): React.ReactElement => {
    if (reason === null) {
      return button
    }
    return (
      <Tooltip>
        {/* span intermedio: los elementos disabled no disparan eventos de hover */}
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    )
  }

  /** Botón Generar/estado de carga; con Tooltip cuando está deshabilitado por prerrequisito. */
  const generateButton = (label: string): React.ReactElement =>
    withTooltip(
      <Button disabled={!canGenerate} onClick={() => void handleGenerate()}>
        {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {isGenerating ? 'Generando guión…' : label}
      </Button>,
      disabledReason
    )

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Guión</h3>
        {!hasScript && generateButton('Generar guión')}
        {hasScript &&
          (isGenerating ? (
            <Button variant="outline" disabled data-testid="script-regenerate-button">
              <Loader2 className="animate-spin" />
              Generando guión…
            </Button>
          ) : (
            withTooltip(
              <Button
                variant="outline"
                disabled={!hasTemplate || keyStatus !== 'ok'}
                data-testid="script-regenerate-button"
                onClick={() => setConfirmRegenerate(true)}
              >
                <RefreshCw />
                Regenerar
              </Button>,
              disabledReason
            )
          ))}
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

      {!hasScript && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Aún no hay guión</p>
          {autoGenerating ? (
            // Autogeneración en curso (SPEC-033): el indicador sustituye al
            // botón del empty state (mismo Loader2 que la generación manual).
            // Solo para la automática: en la manual el CTA del empty state
            // desaparece (canGenerate), exactamente igual que hasta ahora (AC).
            <Button disabled>
              <Loader2 className="animate-spin" />
              Generando guión…
            </Button>
          ) : (
            canGenerate && (
              <Button onClick={() => void handleGenerate()}>
                <Sparkles />
                Generar guión
              </Button>
            )
          )}
        </div>
      )}

      {hasScript && (
        <div className="flex flex-col gap-4">
          <MarkdownEditor
            key={editorResetKey}
            initialMarkdown={persistedScript}
            onChange={setScriptDraft}
            ariaLabel="Guión"
            testId="script-markdown-editor"
          />
          {/* SPEC-025: la sección "Objetivos" superior es la vista de estado;
              este bloque es la única superficie de edición, siempre visible */}
          <div className="flex flex-col gap-2">
            <h4 className="text-base font-semibold">Objetivos</h4>
            {displayedObjectives.map((objective, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={objective}
                  onChange={(event) =>
                    setObjectivesDraft((draft) =>
                      (draft ?? [...interview.objectives]).map((item, itemIndex) =>
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
                      (draft ?? [...interview.objectives]).filter(
                        (_item, itemIndex) => itemIndex !== index
                      )
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
                onClick={() =>
                  setObjectivesDraft((draft) => [...(draft ?? interview.objectives), ''])
                }
              >
                <Plus />
                Añadir objetivo
              </Button>
            </div>
          </div>
          {isDirty && (
            <div
              data-testid="script-editor-actions"
              className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background py-3"
            >
              <Button variant="outline" disabled={saving} onClick={() => setConfirmDiscard(true)}>
                Descartar
              </Button>
              <Button disabled={saving} onClick={() => void handleSave()}>
                {saving && <Loader2 className="animate-spin" />}
                Guardar
              </Button>
            </div>
          )}
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
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false)
                setScriptDraft(null)
                setObjectivesDraft(null)
                setEditorResetKey((key) => key + 1)
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
