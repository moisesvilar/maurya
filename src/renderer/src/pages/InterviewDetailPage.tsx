import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AiCostInline } from '@/components/interviews/AiCostInline'
import { NoteScriptSections } from '@/components/interviews/NoteScriptSections'
import { ObjectivesSection } from '@/components/interviews/ObjectivesSection'
import { AssistantLiveSection } from '@/components/recording/AssistantLiveSection'
import { RecordingSection } from '@/components/recording/RecordingSection'
import { STATUS_LABELS } from '@/components/interviews/statusLabels'
import { useContacts } from '@/hooks/useContacts'
import { useInterviewTemplates } from '@/hooks/useInterviewTemplates'
import { useRecordingController } from '@/hooks/useRecordingController'
import type { Company, Interview } from '@/types/domain'

type InterviewDetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; interview: Interview; company: Company }

/**
 * Detalle de una entrevista (SPEC-013, ruta
 * /discoveries/:discoveryId/companies/:companyId/interviews/:interviewId —
 * Layout 2 detalle, la top bar sigue marcando "Discoveries" por prefijo):
 * back button "Volver" contextual (SPEC-048: a la página del grupo si la
 * entrevista tiene `interviewGroupId`, al detalle global de la empresa
 * `/companies/:companyId` en caso contrario), h1 con el título + Badge de
 * estado, fila muted de referencias (empresa · contacto · template, con
 * fallbacks "Sin contacto"/"Sin template"), la sección Objetivos destacada
 * (ObjectivesSection, SPEC-025: indicador de progreso principal, inmediatamente
 * tras la cabecera), las secciones Nota y Guión compuestas por
 * NoteScriptSections (SPEC-027): apiladas mientras falte una de las dos y en
 * pestañas "Notas"/"Guión" cuando coexisten — y, al final, la sección Grabación
 * (RecordingSection, SPEC-015: captura mic+sistema con transcripción en vivo;
 * SPEC-030: va en último lugar porque tras el flujo end-to-end es material de
 * archivo que se consulta poco, mientras la nota y el guión son el material de
 * trabajo). Resuelve entrevista y empresa con
 * Promise.all(getInterview, getCompany); un id inexistente o un error del
 * bridge muestran el error state con enlace "Volver a Discoveries". Al generar
 * o editar el guión — o al asociarse una grabación —, onInterviewUpdated
 * refresca la entrevista del estado ready (el Badge pasa a
 * "Preparada"/"Grabada" sin recargar).
 * Los nombres de contacto/template se resuelven con los listados ya cargados
 * (useContacts + useInterviewTemplates), sin llamadas extra.
 */
export function InterviewDetailPage(): React.ReactElement {
  const { companyId, interviewId } = useParams<{
    companyId: string
    interviewId: string
  }>()
  const navigate = useNavigate()
  const [state, setState] = useState<InterviewDetailState>({ status: 'loading' })
  const { state: contactsState } = useContacts(companyId ?? '')
  const { state: templatesState } = useInterviewTemplates()

  // No marca loading por sí mismo: el estado inicial ya lo es y el efecto de
  // montaje no debe hacer setState síncrono (react-hooks/set-state-in-effect);
  // los setState viven en el callback de la promesa (patrón CompanyDetailPage).
  useEffect(() => {
    void Promise.all([
      window.api.db.getInterview(interviewId ?? ''),
      window.api.db.getCompany(companyId ?? '')
    ]).then(([interviewResult, companyResult]) => {
      if (!interviewResult.ok) {
        setState({ status: 'error', message: interviewResult.error.message })
        return
      }
      if (!companyResult.ok) {
        setState({ status: 'error', message: companyResult.error.message })
        return
      }
      setState({ status: 'ready', interview: interviewResult.data, company: companyResult.data })
    })
  }, [interviewId, companyId])

  /** Callback compartido por Grabación y Guión: refresca la entrevista del estado ready. */
  const handleInterviewUpdated = useCallback(
    (interview: Interview): void =>
      setState((previous) => (previous.status === 'ready' ? { ...previous, interview } : previous)),
    []
  )

  /**
   * Nombres de los contactos asignados unidos por ", " (SPEC-043, en el orden
   * de `contactIds`); "Sin contacto" si no hay o ninguno se resuelve.
   */
  const contactLabel = (interview: Interview): string => {
    if (contactsState.status === 'ready') {
      const names = interview.contactIds
        .map((contactId) => contactsState.contacts.find((item) => item.id === contactId)?.name)
        .filter((name): name is string => name !== undefined)
      if (names.length > 0) {
        return names.join(', ')
      }
    }
    return 'Sin contacto'
  }

  /** Nombre del template asignado; "Sin template" si no hay o no se resuelve. */
  const templateLabel = (interview: Interview): string => {
    if (interview.templateId !== null && templatesState.status === 'ready') {
      const template = templatesState.templates.find((item) => item.id === interview.templateId)
      if (template !== undefined) {
        return template.name
      }
    }
    return 'Sin template'
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        {/* SPEC-048: back contextual — al grupo si la entrevista pertenece a
            uno, al detalle global de la empresa en caso contrario */}
        <Button
          variant="ghost"
          onClick={() =>
            void navigate(
              state.status === 'ready' && state.interview.interviewGroupId !== null
                ? `/discoveries/${state.interview.discoveryId}/groups/${state.interview.interviewGroupId}`
                : `/companies/${companyId}`
            )
          }
        >
          <ArrowLeft />
          Volver
        </Button>
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Link to="/discoveries" className="text-sm font-medium underline underline-offset-4">
            Volver a Discoveries
          </Link>
        </div>
      )}

      {state.status === 'ready' && (
        <InterviewDetailContent
          interview={state.interview}
          company={state.company}
          contactLabel={contactLabel(state.interview)}
          templateLabel={templateLabel(state.interview)}
          onInterviewUpdated={handleInterviewUpdated}
        />
      )}
    </div>
  )
}

interface InterviewDetailContentProps {
  interview: Interview
  company: Company
  contactLabel: string
  templateLabel: string
  onInterviewUpdated: (interview: Interview) => void
}

/**
 * Ready-branch del detalle de entrevista (SPEC-041, patrón
 * CaptureDetailContent de SPEC-034): crea el controller de grabación en un
 * componente hijo para no condicionar hooks, de modo que la página pueda
 * pintar el panel del asistente ARRIBA — entre «Objetivos» y Nota/Guión —
 * mientras se graba, y lo comparte con la sección Grabación por prop. El
 * ciclo de vida del controller (auto-guardado al desmontar, close guard) es
 * el mismo que tenía dentro de la sección.
 */
function InterviewDetailContent({
  interview,
  company,
  contactLabel,
  templateLabel,
  onInterviewUpdated
}: InterviewDetailContentProps): React.ReactElement {
  const controller = useRecordingController(interview, onInterviewUpdated)

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{interview.title}</h1>
          <Badge variant="secondary">{STATUS_LABELS[interview.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {company.name} · {contactLabel} · {templateLabel} ·{' '}
          <AiCostInline aiUsage={interview.aiUsage} />
        </p>
      </div>

      {/* SPEC-025: los objetivos van arriba del todo, inmediatamente tras
          la cabecera — son el indicador de progreso principal */}
      <ObjectivesSection interview={interview} onInterviewUpdated={onInterviewUpdated} />

      {/* SPEC-041: el panel del asistente, entre objetivos y Nota/Guión,
          solo mientras se graba */}
      <AssistantLiveSection controller={controller} />

      <NoteScriptSections interview={interview} onInterviewUpdated={onInterviewUpdated} />

      {/* SPEC-030: la Grabación cierra la página — tras el flujo end-to-end
          es material de archivo (rutas WAV/transcript, latencia) */}
      <RecordingSection
        interview={interview}
        onInterviewUpdated={onInterviewUpdated}
        controller={controller}
        variant="interview"
      />
    </>
  )
}
