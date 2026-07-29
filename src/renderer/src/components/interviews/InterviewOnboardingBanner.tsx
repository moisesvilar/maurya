import React, { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  ClipboardCheck,
  FileText,
  LayoutTemplate,
  Loader2,
  Mic,
  Sparkles,
  Target
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useOnboardingActions,
  useOnboardingRegistry,
  type OnboardingSectionAction
} from '@/components/interviews/onboardingBridge'
import type { RecordingController } from '@/hooks/useRecordingController'
import { deriveOnboardingStep } from '@/lib/onboardingStep'
import { hasHardDenial } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import type { Interview } from '@/types/domain'

type NotePresence = 'loading' | 'present' | 'absent'

const TOTAL_STEPS = 7
/** Mismo literal que la top bar (SPEC-055-iter-2, denegación dura de permisos). */
const START_BLOCKED_REASON = 'Hay permisos de audio denegados: concédelos en Ajustes del Sistema'

interface InterviewOnboardingBannerProps {
  interview: Interview
  onInterviewUpdated: (interview: Interview) => void
  /** Controller de la página (SPEC-034/055): el paso 4 dispara SU handleStart. */
  controller: RecordingController
  /** Abre el diálogo de edición con el select «Plantilla de preguntas» (paso 1). */
  onAssignTemplate: () => void
}

/**
 * Banner de guía del detalle de entrevista (SPEC-058): un único paso con una
 * única acción, derivado del estado real de la entrevista
 * (lib/onboardingStep). Vive entre RecordingSurface y Objetivos en ambas
 * páginas de detalle. Su botón es el ÚNICO primary del contenido de la
 * página. Las acciones de Guión/Nota/Objetivos se espejan de las secciones vía
 * el puente (onboardingBridge): la sección es la única dueña del estado y del
 * disparo, así que el banner refleja la generación del guión venga del botón
 * de la sección, del suyo propio o de la autogeneración de SPEC-033
 * (SPEC-058-iter-1). La de grabación usa el controller de la página (la top bar
 * SPEC-055 sigue siendo la fuente de estado). Mockups y decisiones en el
 * artifact enlazado en la spec.
 */
export function InterviewOnboardingBanner({
  interview,
  onInterviewUpdated,
  controller,
  onAssignTemplate
}: InterviewOnboardingBannerProps): React.ReactElement | null {
  const [notePresence, setNotePresence] = useState<NotePresence>('loading')
  const [marking, setMarking] = useState(false)
  const [creatingNote, setCreatingNote] = useState(false)
  const actions = useOnboardingActions()
  const registry = useOnboardingRegistry()

  const interviewId = interview.id
  const interviewStatus = interview.status

  // Existencia de la nota (patrón NoteScriptSections): se re-resuelve si
  // cambia el status (generar la nota lo lleva a summarized) — así el banner
  // avanza de 5 a 6/7 sin recargar, dispare quien dispare la generación.
  useEffect(() => {
    void window.api.db.getNoteByInterview(interviewId).then((result) => {
      setNotePresence(result.ok && result.data !== null ? 'present' : 'absent')
    })
  }, [interviewId, interviewStatus])

  const onInterviewUpdatedRef = useRef(onInterviewUpdated)
  useEffect(() => {
    onInterviewUpdatedRef.current = onInterviewUpdated
  }, [onInterviewUpdated])

  const derived = deriveOnboardingStep({
    interview,
    hasNote: notePresence === 'present',
    capturing: controller.capturing
  })

  if (derived === null) {
    return null
  }
  // Con grabación asociada el paso depende de la nota: no pintar un paso
  // provisional mientras la existencia de la nota aún se resuelve.
  if (
    notePresence === 'loading' &&
    (interview.wavPath !== null ||
      interviewStatus === 'recorded' ||
      interviewStatus === 'summarized')
  ) {
    return null
  }

  const { step, degraded } = derived

  const handleConfirmObjectives = async (): Promise<void> => {
    setMarking(true)
    try {
      const result = await window.api.db.confirmInterviewObjectives(interviewId)
      if (result.ok) {
        onInterviewUpdatedRef.current(result.data)
      } else {
        toast.error(result.error.message)
      }
    } finally {
      setMarking(false)
    }
  }

  const handleHide = async (): Promise<void> => {
    setMarking(true)
    try {
      const result = await window.api.db.hideInterviewOnboarding(interviewId)
      if (result.ok) {
        onInterviewUpdatedRef.current(result.data)
      } else {
        toast.error(result.error.message)
      }
    } finally {
      setMarking(false)
    }
  }

  /**
   * Paso 5 degradado: crea la nota vacía (canal existente db:note:create),
   * avisa a NoteScriptSections vía el puente para que monte la sección Nota,
   * y lleva el foco al editor (AC: scroll a la sección + foco).
   */
  const handleWriteNote = async (): Promise<void> => {
    setCreatingNote(true)
    try {
      const result = await window.api.db.createNote({ interviewId, contentMarkdown: '' })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      setNotePresence('present')
      registry?.notifyNoteCreated(result.data)
      // La sección Nota se monta en el siguiente render; el editor (TipTap)
      // tarda un tick más. Reintento corto y acotado.
      window.setTimeout(() => {
        const editor = document.querySelector('[data-testid="note-markdown-editor"]')
        editor?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        const surface = editor?.querySelector<HTMLElement>('[contenteditable="true"]')
        surface?.focus()
      }, 150)
    } finally {
      setCreatingNote(false)
    }
  }

  /** Botón primary con Tooltip cuando está deshabilitado (regla 5.4). */
  const actionButton = (
    label: string,
    busyLabel: string,
    busy: boolean,
    disabledReason: string | null,
    onClick: () => void
  ): React.ReactElement => {
    const button = (
      <Button
        data-testid="onboarding-step-action"
        disabled={busy || disabledReason !== null}
        onClick={onClick}
      >
        {busy ? <Loader2 className="animate-spin" /> : null}
        {busy ? busyLabel : label}
      </Button>
    )
    if (disabledReason === null || busy) {
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

  /** Botón del paso 2/5/6 espejado de la acción registrada por su sección. */
  const mirroredButton = (
    label: string,
    busyLabel: string,
    action: OnboardingSectionAction | null
  ): React.ReactElement =>
    actionButton(
      label,
      busyLabel,
      action?.busy ?? false,
      action === null ? null : action.disabled ? action.disabledReason : null,
      () => action?.run()
    )

  interface StepContent {
    icon: React.ReactElement
    title: string
    description: string
    action: React.ReactElement
  }

  const stepContent = (): StepContent => {
    switch (step) {
      case 1:
        return {
          icon: <LayoutTemplate aria-hidden="true" />,
          title: 'Asigna una plantilla de preguntas',
          description:
            'El guión se genera a partir de una plantilla. Elige la que encaje con esta entrevista; puedes cambiarla mientras no haya guión.',
          action: actionButton('Asignar plantilla', '', false, null, onAssignTemplate)
        }
      case 2:
        return {
          icon: <Sparkles aria-hidden="true" />,
          title: 'Genera el guión antes de la entrevista',
          description:
            'Con la plantilla y el contexto de la empresa, la IA prepara el guión y propone los objetivos de la entrevista.',
          action: mirroredButton('Generar guión', 'Generando guión…', actions?.script ?? null)
        }
      case 3:
        return {
          icon: <Target aria-hidden="true" />,
          title: 'Revisa los objetivos',
          description:
            'El guión propuso estos objetivos. Añade o elimina los que quieras antes de la entrevista; cuando estén a tu gusto, confírmalo aquí.',
          action: actionButton(
            'Objetivos revisados',
            'Guardando…',
            marking,
            null,
            () => void handleConfirmObjectives()
          )
        }
      case 4:
        return {
          icon: <Mic aria-hidden="true" />,
          title: '¡Todo listo para la entrevista!',
          description:
            'Cuando empiece la entrevista, inicia la grabación. Al terminar podrás generar la nota y evaluar los objetivos.',
          action: actionButton(
            'Iniciar grabación',
            '',
            false,
            hasHardDenial(controller.permissions) ? START_BLOCKED_REASON : null,
            controller.handleStart
          )
        }
      case 5:
        if (degraded) {
          return {
            icon: <FileText aria-hidden="true" />,
            title: 'La grabación no tiene transcripción',
            description:
              'La transcripción falló durante la grabación, así que la nota no se puede generar con IA. Puedes escribirla a mano en la sección Nota.',
            action: actionButton(
              'Escribir nota',
              'Creando nota…',
              creatingNote,
              null,
              () => void handleWriteNote()
            )
          }
        }
        return {
          icon: <FileText aria-hidden="true" />,
          title: 'Genera la nota de la entrevista',
          description:
            'La transcripción ya está disponible. Genera la nota de resumen a partir de ella.',
          action: mirroredButton('Generar nota', 'Generando nota…', actions?.note ?? null)
        }
      case 6:
        return {
          icon: <ClipboardCheck aria-hidden="true" />,
          title: 'Evalúa los objetivos',
          description:
            'La IA marca cada objetivo como cumplido o no según la transcripción; después puedes corregir cualquier marca a mano.',
          action: mirroredButton(
            'Evaluar objetivos',
            'Evaluando objetivos…',
            actions?.objectives ?? null
          )
        }
      case 7:
        return {
          icon: <CheckCircle2 className="text-green-600 dark:text-green-500" aria-hidden="true" />,
          title: '¡Entrevista finalizada!',
          description:
            'Nota generada y objetivos evaluados. Puedes exportar la nota o revisar la evaluación cuando quieras.',
          action: (
            <Button
              variant="ghost"
              data-testid="onboarding-hide-button"
              disabled={marking}
              onClick={() => void handleHide()}
            >
              Ocultar
            </Button>
          )
        }
    }
  }

  const content = stepContent()

  return (
    <div
      data-testid="interview-onboarding-banner"
      data-step={step}
      data-degraded={degraded || undefined}
      className={cn(
        'flex flex-col items-start gap-4 rounded-lg border bg-card p-4 text-card-foreground md:flex-row md:items-center md:gap-5 md:px-5',
        step === 7 && 'border-green-600/35 dark:border-green-500/35'
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Paso {step} de {TOTAL_STEPS}
          </span>
          <span className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
              <span
                key={index}
                className={cn(
                  'h-1 w-4 rounded-full',
                  index < step - 1 && 'bg-foreground',
                  index === step - 1 && 'bg-foreground opacity-40',
                  index > step - 1 && 'bg-border'
                )}
              />
            ))}
          </span>
        </div>
        <p className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:shrink-0">
          {content.icon}
          {content.title}
        </p>
        <p className="text-sm text-muted-foreground">{content.description}</p>
      </div>
      <div className="shrink-0">{content.action}</div>
    </div>
  )
}
