import React, { useEffect, useState } from 'react'
import { ArrowLeft, Building2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Discovery } from '@/types/domain'

type DiscoveryDetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; discovery: Discovery }

/**
 * Detalle mínimo de un discovery (SPEC-010): back button "Volver" (página de
 * detalle, profundidad 2 — regla 2.3), h1 con el nombre y el empty state de
 * la sección Empresas (el CRUD de empresas es la siguiente spec). Resuelve el
 * discovery con `listDiscoveries` + find por id (nota técnica: volumen
 * trivial); un id inválido o un error del bridge muestran el error state con
 * enlace "Volver a Discoveries".
 */
export function DiscoveryDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<DiscoveryDetailState>({ status: 'loading' })

  // No marca loading por sí mismo: el estado inicial ya lo es y el efecto de
  // montaje no debe hacer setState síncrono (react-hooks/set-state-in-effect);
  // los setState viven en el callback de la promesa (patrón useNoteTemplates).
  // La UI no navega detalle→detalle, así que no hay estado stale entre ids.
  useEffect(() => {
    void window.api.db.listDiscoveries().then((result) => {
      if (!result.ok) {
        setState({ status: 'error', message: result.error.message })
        return
      }
      const discovery = result.data.find((candidate) => candidate.id === id)
      if (discovery === undefined) {
        setState({ status: 'error', message: 'Discovery no encontrado' })
        return
      }
      setState({ status: 'ready', discovery })
    })
  }, [id])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Button variant="ghost" onClick={() => void navigate('/discoveries')}>
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
        <>
          <h1 className="text-2xl font-semibold">{state.discovery.name}</h1>
          <section className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">Empresas</h3>
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Building2 className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Aún no hay empresas</p>
              <p className="text-sm text-muted-foreground">
                El alta de empresas llegará en la siguiente fase
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
