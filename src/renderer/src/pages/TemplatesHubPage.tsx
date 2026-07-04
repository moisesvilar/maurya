import React from 'react'
import { ClipboardList, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Sección Plantillas (SPEC-009): hub con dos accesos. "Plantillas de
 * entrevista" es una Card clicable que lleva al listado de templates de
 * entrevista (SPEC-012, deroga el "Disponible próximamente" de SPEC-009);
 * "Plantillas de notas" es una Card clicable que lleva a la pestaña
 * correspondiente de Ajustes (SPEC-008).
 */
export function TemplatesHubPage(): React.ReactElement {
  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2">
      <Link
        to="/templates/interview"
        className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Card className="h-full transition-colors hover:bg-accent/50">
          <CardHeader>
            <ClipboardList className="size-6 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Plantillas de entrevista</CardTitle>
            <CardDescription>Cuestionarios base para tus entrevistas</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      <Link
        to="/settings?tab=note-templates"
        className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Card className="h-full transition-colors hover:bg-accent/50">
          <CardHeader>
            <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Plantillas de notas</CardTitle>
            <CardDescription>
              Configura las plantillas que estructuran tus notas generadas.
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  )
}
