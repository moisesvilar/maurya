import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Building2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AssignCompanySheet } from '@/components/captures/AssignCompanySheet'
import { AiCostInline } from '@/components/interviews/AiCostInline'
import { NoteScriptSections } from '@/components/interviews/NoteScriptSections'
import { RecordingSection } from '@/components/recording/RecordingSection'
import { STATUS_LABELS } from '@/components/interviews/statusLabels'
import { useInterviewTemplates } from '@/hooks/useInterviewTemplates'
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
      contact: Contact | null
    }

/**
 * Detalle de una captura (SPEC-020, ruta /captures/:id — Layout 2 detalle):
 * misma experiencia que el detalle de entrevista de Discoveries — las secciones
 * Nota y Guión compuestas por NoteScriptSections (SPEC-027: apiladas o en
 * pestañas "Notas"/"Guión") y, al final, la sección Grabación (RecordingSection,
 * SPEC-030: material de archivo tras el flujo end-to-end), con el mismo
 * onInterviewUpdated compartido. La diferencia es el contexto: la captura
 * puede no tener empresa todavía; en ese caso la cabecera muestra el botón
 * "Asignar empresa" que abre el Sheet de asignación diferida.
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
  const [assignOpen, setAssignOpen] = useState(false)
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
      const [discoveryResult, companyResult, contactResult] = await Promise.all([
        window.api.db.getDiscovery(interview.discoveryId),
        interview.companyId !== null ? window.api.db.getCompany(interview.companyId) : null,
        interview.contactId !== null ? window.api.db.getContact(interview.contactId) : null
      ])
      setState({
        status: 'ready',
        interview,
        discovery: discoveryResult.ok ? discoveryResult.data : null,
        company: companyResult !== null && companyResult.ok ? companyResult.data : null,
        contact: contactResult !== null && contactResult.ok ? contactResult.data : null
      })
    })()
  }, [id])

  /** Callback compartido por las tres secciones: refresca la entrevista del estado ready. */
  const handleInterviewUpdated = useCallback(
    (interview: Interview): void =>
      setState((previous) => (previous.status === 'ready' ? { ...previous, interview } : previous)),
    []
  )

  /** La asignación refleja empresa/contacto en cabecera sin recargar (AC). */
  const handleAssigned = useCallback((result: AssignCompanyResult): void => {
    setState((previous) =>
      previous.status === 'ready'
        ? {
            ...previous,
            interview: result.interview,
            company: result.company,
            contact: result.contact
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
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold">{state.interview.title}</h1>
                <Badge variant="secondary">{STATUS_LABELS[state.interview.status]}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {state.discovery?.name ?? ''} · {state.company?.name ?? 'Sin empresa'} ·{' '}
                {state.contact?.name ?? 'Sin contacto'} · {templateLabel(state.interview)} ·{' '}
                <AiCostInline aiUsage={state.interview.aiUsage} />
              </p>
            </div>
            {state.interview.companyId === null && (
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

          <NoteScriptSections
            interview={state.interview}
            onInterviewUpdated={handleInterviewUpdated}
          />

          {/* SPEC-030: la Grabación cierra la página — tras el flujo end-to-end
              es material de archivo (rutas WAV/transcript, latencia) */}
          <RecordingSection
            interview={state.interview}
            onInterviewUpdated={handleInterviewUpdated}
          />

          <AssignCompanySheet
            open={assignOpen}
            onOpenChange={setAssignOpen}
            interview={state.interview}
            discoveryName={state.discovery?.name ?? ''}
            onAssigned={handleAssigned}
          />
        </>
      )}
    </div>
  )
}
