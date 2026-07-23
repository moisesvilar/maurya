import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Building2, Mic } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AssignCompanySheet } from '@/components/captures/AssignCompanySheet'
import { AssistantLiveSection } from '@/components/recording/AssistantLiveSection'
import { AiCostInline } from '@/components/interviews/AiCostInline'
import { NoteScriptSections } from '@/components/interviews/NoteScriptSections'
import { ObjectivesSection } from '@/components/interviews/ObjectivesSection'
import { TopBarPortal } from '@/components/layout/TopBarSlot'
import { CaptureTopBarControls } from '@/components/recording/CaptureTopBarControls'
import { RecordingSection } from '@/components/recording/RecordingSection'
import { STATUS_LABELS } from '@/components/interviews/statusLabels'
import { useInterviewTemplates } from '@/hooks/useInterviewTemplates'
import { useRecordingController } from '@/hooks/useRecordingController'
import type { AssignCompanyResult } from '@/types/captures'
import type { Company, Contact, Discovery, Interview } from '@/types/domain'

type CaptureDetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      interview: Interview
      discovery: Discovery | null
      company: Company | null
      /** SPEC-043: contactos resueltos en el orden de contactIds (rotos se omiten). */
      contacts: Contact[]
    }

/**
 * Detalle de una captura (SPEC-020, ruta /captures/:id — Layout 2 detalle):
 * misma experiencia que el detalle de entrevista de Discoveries — la sección
 * Objetivos (ObjectivesSection, SPEC-025: indicador de progreso principal),
 * las secciones Nota y Guión compuestas por NoteScriptSections (SPEC-027:
 * apiladas o en pestañas "Notas"/"Guión") y, al final, la sección Grabación
 * (RecordingSection,
 * SPEC-030: material de archivo tras el flujo end-to-end), con el mismo
 * onInterviewUpdated compartido. La diferencia es el contexto: la captura
 * puede no tener empresa todavía; en ese caso la cabecera muestra el botón
 * "Asignar empresa" que abre el Sheet de asignación diferida.
 * SPEC-034: los controles de preparación de la grabación suben — permisos y
 * micrófono a la top bar (portal al slot del Layout) y «Iniciar grabación» a
 * la cabecera — solo en estado Preparación; el estado lo posee el
 * useRecordingController creado en el ready-branch (CaptureDetailContent) y
 * compartido con la sección Grabación por prop.
 * Carga encadenada: getInterview y, con el resultado, getDiscovery +
 * condicionales getCompany/getContact — los fallos de estas resoluciones de
 * contexto degradan a "Sin empresa"/"Sin contacto", nunca a error state; el
 * error state (id inexistente o fallo del bridge) solo lo produce la
 * entrevista, con link "Volver a Capturas".
 */
export function CaptureDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<CaptureDetailState>({ status: 'loading' })
  const { state: templatesState } = useInterviewTemplates()

  // No marca loading por sí mismo: el estado inicial ya lo es y el efecto de
  // montaje no debe hacer setState síncrono (react-hooks/set-state-in-effect);
  // los setState viven tras las promesas (patrón InterviewDetailPage).
  useEffect(() => {
    void (async () => {
      const interviewResult = await window.api.db.getInterview(id ?? '')
      if (!interviewResult.ok) {
        setState({ status: 'error', message: interviewResult.error.message })
        return
      }
      const interview = interviewResult.data
      const [discoveryResult, companyResult, contactResults] = await Promise.all([
        window.api.db.getDiscovery(interview.discoveryId),
        interview.companyId !== null ? window.api.db.getCompany(interview.companyId) : null,
        Promise.all(interview.contactIds.map((contactId) => window.api.db.getContact(contactId)))
      ])
      setState({
        status: 'ready',
        interview,
        discovery: discoveryResult.ok ? discoveryResult.data : null,
        company: companyResult !== null && companyResult.ok ? companyResult.data : null,
        // SPEC-043: referencia rota → se omite (degrada a "Sin contacto",
        // nunca a error state).
        contacts: contactResults.filter((result) => result.ok).map((result) => result.data)
      })
    })()
  }, [id])

  /** Callback compartido por las tres secciones: refresca la entrevista del estado ready. */
  const handleInterviewUpdated = useCallback(
    (interview: Interview): void =>
      setState((previous) => (previous.status === 'ready' ? { ...previous, interview } : previous)),
    []
  )

  /** La asignación refleja empresa/contactos en cabecera sin recargar (AC). */
  const handleAssigned = useCallback((result: AssignCompanyResult): void => {
    setState((previous) =>
      previous.status === 'ready'
        ? {
            ...previous,
            interview: result.interview,
            company: result.company,
            // SPEC-046: todos los participantes asignados, en orden persistido.
            contacts: result.contacts
          }
        : previous
    )
  }, [])

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
        <Button variant="ghost" onClick={() => void navigate('/captures')}>
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
          <Link to="/captures" className="text-sm font-medium underline underline-offset-4">
            Volver a Capturas
          </Link>
        </div>
      )}

      {state.status === 'ready' && (
        <CaptureDetailContent
          interview={state.interview}
          discovery={state.discovery}
          company={state.company}
          contacts={state.contacts}
          templateLabel={templateLabel(state.interview)}
          onInterviewUpdated={handleInterviewUpdated}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  )
}

interface CaptureDetailContentProps {
  interview: Interview
  discovery: Discovery | null
  company: Company | null
  /** SPEC-043: contactos resueltos en el orden de contactIds (rotos se omiten). */
  contacts: Contact[]
  templateLabel: string
  onInterviewUpdated: (interview: Interview) => void
  onAssigned: (result: AssignCompanyResult) => void
}

/**
 * Ready-branch del detalle de captura (SPEC-034): crea el controller de
 * grabación — mismo ciclo de vida que tenía la sección en esta página, con el
 * auto-guardado al desmontar y el close guard dentro — y lo comparte con la
 * top bar (portal), la cabecera y la sección Grabación.
 */
function CaptureDetailContent({
  interview,
  discovery,
  company,
  contacts,
  templateLabel,
  onInterviewUpdated,
  onAssigned
}: CaptureDetailContentProps): React.ReactElement {
  const [assignOpen, setAssignOpen] = useState(false)
  const controller = useRecordingController(interview, onInterviewUpdated)
  const preparation = !controller.capturing && !controller.recorded

  return (
    <>
      {/* La condición vive FUERA del portal: fuera de Preparación el testid
          desaparece del DOM de la top bar (sin controles muertos) */}
      {preparation && (
        <TopBarPortal>
          <CaptureTopBarControls controller={controller} />
        </TopBarPortal>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{interview.title}</h1>
            <Badge variant="secondary">{STATUS_LABELS[interview.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {discovery?.name ?? ''} · {company?.name ?? 'Sin empresa'} ·{' '}
            {contacts.length > 0
              ? contacts.map((contact) => contact.name).join(', ')
              : 'Sin contacto'}{' '}
            · {templateLabel} · <AiCostInline aiUsage={interview.aiUsage} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {preparation && (
            <Button data-testid="capture-start-button" onClick={controller.handleStart}>
              <Mic />
              Iniciar grabación
            </Button>
          )}
          {interview.companyId === null && (
            <Button
              data-testid="assign-company-button"
              variant="outline"
              onClick={() => setAssignOpen(true)}
            >
              <Building2 />
              Asignar empresa
            </Button>
          )}
        </div>
      </div>

      {/* Mismo orden que el detalle de entrevista: Objetivos (indicador de
          progreso principal, SPEC-025) → panel del asistente (SPEC-041, solo
          mientras se graba) → Nota/Guión */}
      <ObjectivesSection interview={interview} onInterviewUpdated={onInterviewUpdated} />

      <AssistantLiveSection controller={controller} />

      <NoteScriptSections interview={interview} onInterviewUpdated={onInterviewUpdated} />

      {/* SPEC-030: la Grabación cierra la página — tras el flujo end-to-end
          es material de archivo (rutas WAV/transcript, latencia) */}
      <RecordingSection
        interview={interview}
        onInterviewUpdated={onInterviewUpdated}
        controller={controller}
      />

      <AssignCompanySheet
        open={assignOpen}
        onOpenChange={setAssignOpen}
        interview={interview}
        discoveryName={discovery?.name ?? ''}
        onAssigned={onAssigned}
      />
    </>
  )
}
