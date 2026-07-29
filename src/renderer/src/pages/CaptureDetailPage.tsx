import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Building2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AssignCompanySheet } from '@/components/captures/AssignCompanySheet'
import { EditCaptureDialog } from '@/components/captures/EditCaptureDialog'
import { AssistantLiveSection } from '@/components/recording/AssistantLiveSection'
import { AiCostInline } from '@/components/interviews/AiCostInline'
import { InterviewOnboardingBanner } from '@/components/interviews/InterviewOnboardingBanner'
import { NoteScriptSections } from '@/components/interviews/NoteScriptSections'
import { ObjectivesSection } from '@/components/interviews/ObjectivesSection'
import { OnboardingBridgeProvider } from '@/components/interviews/onboardingBridge'
import { TopBarPortal } from '@/components/layout/TopBarSlot'
import { RecordingTopBarControls } from '@/components/recording/RecordingTopBarControls'
import { PermissionErrorAlert } from '@/components/recording/PermissionErrorAlert'
import { RecordingSurface } from '@/components/recording/RecordingSurface'
import { STATUS_LABELS } from '@/components/interviews/statusLabels'
import type { EditCaptureValues } from '@/hooks/useCaptures'
import { useInterviewTemplates } from '@/hooks/useInterviewTemplates'
import { useRecordingController } from '@/hooks/useRecordingController'
import type { AssignCompanyResult } from '@/types/captures'
import type { Company, Contact, Discovery, Interview, InterviewTemplate } from '@/types/domain'

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
 * la cabecera — solo en estado Preparación; extensión posterior: durante la
 * Grabación la sesión en vivo (cronómetro, Detener, estado de transcripción y
 * medidores) también vive en la top bar, siempre visible sin scroll. El estado
 * lo posee el useRecordingController creado en el ready-branch
 * (CaptureDetailContent) y compartido con la sección Grabación por prop.
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

  /** Nombre del template asignado; "Sin plantilla" si no hay o no se resuelve. */
  const templateLabel = (interview: Interview): string => {
    if (interview.templateId !== null && templatesState.status === 'ready') {
      const template = templatesState.templates.find((item) => item.id === interview.templateId)
      if (template !== undefined) {
        return template.name
      }
    }
    return 'Sin plantilla'
  }

  /**
   * Guardado del diálogo de edición abierto desde el banner (SPEC-058, paso
   * 1): mismo patch que useCaptures.updateCapture; los contactos de la
   * cabecera se re-resuelven porque el Dialog puede cambiarlos (SPEC-046).
   */
  const handleEditSubmit = async (values: EditCaptureValues): Promise<boolean> => {
    if (state.status !== 'ready') {
      return false
    }
    const result = await window.api.db.updateInterview(state.interview.id, {
      title: values.title,
      templateId: values.templateId,
      ...(values.contactIds !== undefined ? { contactIds: values.contactIds } : {})
    })
    if (!result.ok) {
      toast.error(result.error.message)
      return false
    }
    const contactResults = await Promise.all(
      result.data.contactIds.map((contactId) => window.api.db.getContact(contactId))
    )
    setState((previous) =>
      previous.status === 'ready'
        ? {
            ...previous,
            interview: result.data,
            contacts: contactResults.filter((item) => item.ok).map((item) => item.data)
          }
        : previous
    )
    toast('Cambios guardados')
    return true
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
          templates={templatesState.status === 'ready' ? templatesState.templates : []}
          onInterviewUpdated={handleInterviewUpdated}
          onAssigned={handleAssigned}
          onEditSubmit={handleEditSubmit}
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
  /** Templates para el select «Plantilla de preguntas» del diálogo (SPEC-058). */
  templates: InterviewTemplate[]
  onInterviewUpdated: (interview: Interview) => void
  onAssigned: (result: AssignCompanyResult) => void
  /** Guardado del diálogo de edición del paso 1 del banner (SPEC-058). */
  onEditSubmit: (values: EditCaptureValues) => Promise<boolean>
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
  templates,
  onInterviewUpdated,
  onAssigned,
  onEditSubmit
}: CaptureDetailContentProps): React.ReactElement {
  const [assignOpen, setAssignOpen] = useState(false)
  // SPEC-058: «Asignar plantilla» (paso 1 del banner) abre el diálogo de
  // edición aquí — hasta ahora solo existía en el listado de Capturas.
  const [editOpen, setEditOpen] = useState(false)
  const controller = useRecordingController(interview, onInterviewUpdated)

  return (
    <>
      {/* SPEC-055-iter-1: TODA la sesión (permisos, «Iniciar grabación»,
          selector, Grabando, Grabada) vive en la top bar portalada al slot del
          Layout, en los tres estados. La cabecera solo conserva «Asignar
          empresa» (específico de la captura sin empresa). */}
      <TopBarPortal>
        <RecordingTopBarControls controller={controller} />
      </TopBarPortal>

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
        {interview.companyId === null && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="assign-company-button"
              variant="outline"
              onClick={() => setAssignOpen(true)}
            >
              <Building2 />
              Asignar empresa
            </Button>
          </div>
        )}
      </div>

      {/* SPEC-049: el error de permiso al iniciar la grabación se pinta aquí,
          bajo la cabecera y antes de Objetivos — visible sin scroll */}
      <PermissionErrorAlert error={controller.error} />

      {/* SPEC-055: la superficie de grabación (avisos + detalle de Grabada) vive
          bajo la cabecera, antes de Objetivos — ya no hay sección al final */}
      <RecordingSurface
        interview={interview}
        onInterviewUpdated={onInterviewUpdated}
        controller={controller}
      />

      {/* SPEC-058: el puente banner↔secciones envuelve el banner de
          onboarding y las secciones cuyas acciones espeja. Mismo orden que el
          detalle de entrevista: banner → Objetivos (SPEC-025) → panel del
          asistente (SPEC-041, solo mientras se graba) → Nota/Guión */}
      <OnboardingBridgeProvider>
        <InterviewOnboardingBanner
          interview={interview}
          onInterviewUpdated={onInterviewUpdated}
          controller={controller}
          onAssignTemplate={() => setEditOpen(true)}
        />

        <ObjectivesSection interview={interview} onInterviewUpdated={onInterviewUpdated} />

        <AssistantLiveSection controller={controller} />

        {/* SPEC-059: `capturing` llega hasta la sección Guión — con el banner
            oculto por la grabación, su empty state recupera el CTA */}
        <NoteScriptSections
          interview={interview}
          onInterviewUpdated={onInterviewUpdated}
          capturing={controller.capturing}
        />
      </OnboardingBridgeProvider>

      <AssignCompanySheet
        open={assignOpen}
        onOpenChange={setAssignOpen}
        interview={interview}
        discoveryName={discovery?.name ?? ''}
        onAssigned={onAssigned}
      />

      <EditCaptureDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        interview={editOpen ? interview : null}
        templates={templates}
        onSubmit={onEditSubmit}
      />
    </>
  )
}
