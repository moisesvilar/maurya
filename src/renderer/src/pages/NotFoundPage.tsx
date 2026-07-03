import React from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

/**
 * Página 404 (SPEC-009): ruta inexistente con salida (nunca callejón sin
 * salida). El título "Página no encontrada" lo da también el top bar.
 */
export function NotFoundPage(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-semibold">Página no encontrada</p>
      <Button asChild variant="link">
        <Link to="/capture">Ir a Captura</Link>
      </Button>
    </div>
  )
}
