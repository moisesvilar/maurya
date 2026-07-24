import React, { useEffect, useState } from 'react'
import { Download, FileText, Loader2, RefreshCw, Sparkles } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MarkdownEditor } from '@/components/markdown/MarkdownEditor'
import { TranscriptSheet } from '@/components/interviews/TranscriptSheet'
import { useNoteTemplates } from '@/hooks/useNoteTemplates'
import type { Interview, Note } from '@/types/domain'
import type { NoteExportTarget } from '@/types/notes'

type KeyStatus = 'loading' | 'ok' | 'missing'

type NoteState = { status: 'loading' } | { status: 'ready'; note: Note | null }

interface NoteSectionProps {
  interview: Interview
  onInterviewUpdated: (interview: Interview) => void
  /** Notifica la existencia de la nota (carga inicial y tras generar) — lo usa NoteScriptSections para la disposición (SPEC-027). */
  onNoteChange?: (note: Note | null) => void
}

/**
 * Sección Nota del detalle de entrevista (SPEC-017): generación del resumen
 * con Claude según el note-template elegido (main process) y edición siempre
 * activa (SPEC-029): con nota, el editor WYSIWYG (MarkdownEditor, SPEC-027;
 * Riesgo #6: control humano) está siempre visible y editable, sin modo lectura
 * ni botón "Editar". "Guardar"/"Descartar" solo aparecen con cambios: el editor
 * solo emite onChange en ediciones reales, así el dirty-check compara contra el
 * string persistido sin falsos positivos por normalización (draft null =
 * prístino, nunca inicializado en efectos). El contenido del editor solo se
 * resetea remontándolo (key por contador) en descarte confirmado y regeneración
 * con éxito; tras "Guardar" NO se remonta — el contenido ya es el persistido y
 * así se conservan foco y caret. Incluye consulta de la transcripción en Sheet
 * y exportación a Markdown vía save dialog del SO. Patrón ScriptSection
 * (SPEC-014): estado local sin hook aparte; prerrequisitos (transcripción,
 * note-template y clave de Anthropic) deshabilitan la generación con
 * Tooltip/Alert; regenerar y descartar cambios piden confirmación con
 * AlertDialog; los errores del LLM son un Alert destructive persistente.
 * SPEC-035: el estado vacío «Graba la entrevista para poder generar la
 * nota.» (SPEC-017) queda derogado — sin nota y sin transcripción esta
 * sección ya ni se monta (NoteScriptSections), así que la rama se eliminó.
 * SPEC-047: si la entrevista pertenece a un grupo con template de notas, ese
 * template es la preselección del Select (la elección manual sigue mandando).
 */
export function NoteSection({
  interview,
  onInterviewUpdated,
  onNoteChange
}: NoteSectionProps): React.ReactElement {
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('loading')
  const [noteState, setNoteState] = useState<NoteState>({ status: 'loading' })
  const { state: templatesState } = useNoteTemplates()
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [groupNoteTemplateId, setGroupNoteTemplateId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  // null = prístino: el editor no ha recibido ninguna edición real desde el
  // último reset; el dirty-check es por comparación con el persistido.
  const [draft, setDraft] = useState<string | null>(null)
  // Key del MarkdownEditor: incrementarla remonta el editor con el contenido
  // persistido (única forma de resetear TipTap). Solo en descarte/regeneración.
  const [editorResetKey, setEditorResetKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  // setState en el callback de la promesa, nunca síncrono en el efecto
  // (patrón InterviewDetailPage / react-hooks/set-state-in-effect).
  useEffect(() => {
    void window.api.llm.getStatus().then((result) => {
      setKeyStatus(result.ok && result.data.hasAnthropicKey ? 'ok' : 'missing')
    })
  }, [])

  useEffect(() => {
    void window.api.db.getNoteByInterview(interview.id).then((result) => {
      const note = result.ok ? result.data : null
      setNoteState({ status: 'ready', note })
      onNoteChange?.(note)
    })
    // onNoteChange es un callback estable del padre (useCallback); solo el
    // cambio de entrevista debe relanzar la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.id])

  // SPEC-047: template de notas del grupo como preselección. Sin grupo (p. ej.
  // capturas) no hay llamada extra; el reset vía microtask respeta
  // react-hooks/set-state-in-effect. Envelope con fallo o grupo borrado → null
  // (se degrada al primer template, comportamiento SPEC-017).
  useEffect(() => {
    const groupId = interview.interviewGroupId
    if (groupId === null) {
      void Promise.resolve().then(() => setGroupNoteTemplateId(null))
      return
    }
    void window.api.db.getInterviewGroup(groupId).then((result) => {
      setGroupNoteTemplateId(result.ok ? result.data.noteTemplateId : null)
    })
  }, [interview.interviewGroupId])

  const hasTranscript = interview.transcriptPath !== null
  const note = noteState.status === 'ready' ? noteState.note : null
  const templates = templatesState.status === 'ready' ? templatesState.templates : []
  const hasTemplates = templates.length > 0
  /**
   * Template efectivo: el elegido manualmente; si no hay elección, el template
   * de notas del grupo de la entrevista (SPEC-047) cuando resuelve en la lista;
   * en su defecto, el primero del listado (SPEC-017).
   */
  const effectiveTemplateId =
    selectedTemplateId !== '' && templates.some((template) => template.id === selectedTemplateId)
      ? selectedTemplateId
      : groupNoteTemplateId !== null &&
          templates.some((template) => template.id === groupNoteTemplateId)
        ? groupNoteTemplateId
        : (templates[0]?.id ?? '')
  const canGenerate = hasTranscript && hasTemplates && keyStatus === 'ok' && !generating

  const dirty = note !== null && draft !== null && draft !== note.contentMarkdown

  /** Motivo de deshabilitado de la generación (Tooltip); null si está habilitada. */
  const disabledReason = !hasTranscript
    ? 'Graba la entrevista para regenerar la nota'
    : !hasTemplates
      ? 'Necesitas una plantilla de notas'
      : keyStatus !== 'ok'
        ? 'Configura tu clave de Anthropic en Ajustes para generar la nota'
        : null

  const handleGenerate = async (): Promise<void> => {
    if (effectiveTemplateId === '') {
      return
    }
    setGenerating(true)
    setGenerationError(null)
    try {
      const result = await window.api.llm.generateNote(interview.id, effectiveTemplateId)
      if (result.ok) {
        setNoteState({ status: 'ready', note: result.data.note })
        onNoteChange?.(result.data.note)
        onInterviewUpdated(result.data.interview)
        // Reset a prístino + remontaje del editor con la nota nueva (mismo
        // callback → un solo re-render por batching de React 19). Inofensivo
        // en la generación inicial.
        setDraft(null)
        setEditorResetKey((key) => key + 1)
        toast('Nota generada')
      } else {
        // Alert destructive persistente (regla 5.4); la nota previa queda intacta
        setGenerationError(result.error.message)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (note === null || draft === null) {
      return
    }
    setSaving(true)
    try {
      // Solo contentMarkdown: el estado de la entrevista no cambia (AC)
      const result = await window.api.db.updateNote(note.id, { contentMarkdown: draft })
      if (result.ok) {
        setNoteState({ status: 'ready', note: result.data })
        // Ni setDraft(null) ni remontaje: el dirty por comparación ya da false
        // y el editor conserva foco y caret (incluso si el usuario teclea
        // durante el guardado en vuelo, ese onChange vuelve a marcar dirty).
        toast('Nota guardada')
      } else {
        toast.error(result.error.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async (target: NoteExportTarget): Promise<void> => {
    const result = await window.api.notes.export(interview.id, target)
    if (!result.ok) {
      toast.error('No se pudo exportar')
      return
    }
    // Cancelar el diálogo de guardado es un resultado neutro: sin Toast (AC)
    if (result.data.saved) {
      toast(target === 'note' ? 'Nota exportada' : 'Transcripción exportada')
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

  /** Select de note-template (preseleccionado el primero); solo con templates. */
  const templateSelect = hasTemplates ? (
    <Select value={effectiveTemplateId} onValueChange={setSelectedTemplateId}>
      <SelectTrigger className="w-64" aria-label="Plantilla de notas">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {templates.map((template) => (
          <SelectItem key={template.id} value={template.id}>
            {template.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : null

  const viewTranscriptButton = hasTranscript ? (
    <Button variant="outline" onClick={() => setTranscriptOpen(true)}>
      <FileText />
      Ver transcripción
    </Button>
  ) : null

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Nota</h3>
        {note !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download />
                  Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void handleExport('note')}>
                  Exportar nota (.md)
                </DropdownMenuItem>
                {hasTranscript && (
                  <DropdownMenuItem onClick={() => void handleExport('transcript')}>
                    Exportar transcripción (.md)
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {viewTranscriptButton}
            {generating ? (
              <Button variant="outline" disabled data-testid="note-regenerate-button">
                <Loader2 className="animate-spin" />
                Generando nota…
              </Button>
            ) : (
              withTooltip(
                <Button
                  variant="outline"
                  disabled={!canGenerate}
                  data-testid="note-regenerate-button"
                  onClick={() => setConfirmRegenerate(true)}
                >
                  <RefreshCw />
                  Regenerar
                </Button>,
                disabledReason
              )
            )}
          </div>
        )}
      </div>

      {noteState.status === 'loading' && <Skeleton className="h-24 w-full" />}

      {noteState.status === 'ready' && note === null && hasTranscript && (
        <div className="flex flex-col gap-3">
          {templatesState.status === 'ready' && !hasTemplates && (
            <p className="text-sm text-muted-foreground">
              Crea una plantilla de notas para generar la nota —{' '}
              <Link
                to="/settings?tab=note-templates"
                className="font-medium underline underline-offset-4"
              >
                Gestionar plantillas de notas
              </Link>
            </p>
          )}
          {keyStatus === 'missing' && (
            <Alert>
              <Sparkles aria-hidden="true" />
              <AlertDescription>
                Configura tu clave de Anthropic en{' '}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Ajustes
                </Link>{' '}
                para generar la nota
              </AlertDescription>
            </Alert>
          )}
          {generationError !== null && (
            <Alert variant="destructive">
              <AlertDescription>{generationError}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {templateSelect}
            {withTooltip(
              <Button disabled={!canGenerate} onClick={() => void handleGenerate()}>
                {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {generating ? 'Generando nota…' : 'Generar nota'}
              </Button>,
              disabledReason
            )}
            {viewTranscriptButton}
          </div>
        </div>
      )}

      {note !== null && (
        <div className="flex flex-col gap-4">
          {generationError !== null && (
            <Alert variant="destructive">
              <AlertDescription>{generationError}</AlertDescription>
            </Alert>
          )}
          {templateSelect !== null && hasTranscript && <div>{templateSelect}</div>}
          <MarkdownEditor
            key={editorResetKey}
            initialMarkdown={note.contentMarkdown}
            onChange={setDraft}
            ariaLabel="Nota"
            testId="note-markdown-editor"
          />
          {dirty && (
            <div
              data-testid="note-editor-actions"
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

      {interview.transcriptPath !== null && (
        <TranscriptSheet
          transcriptPath={interview.transcriptPath}
          open={transcriptOpen}
          onOpenChange={setTranscriptOpen}
        />
      )}

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerar nota</AlertDialogTitle>
            <AlertDialogDescription>
              La nota actual, incluidas tus ediciones, se sustituirá por una nueva.
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
              Los cambios sin guardar de la nota se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false)
                setDraft(null)
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
