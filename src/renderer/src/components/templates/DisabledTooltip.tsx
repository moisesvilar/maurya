import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface DisabledTooltipProps {
  tooltip: string
  children: React.ReactNode
}

/**
 * Envuelve un botón deshabilitado para que el Tooltip funcione: un botón
 * disabled no dispara eventos de puntero, así que el trigger real es un span
 * con tabIndex 0 (patrón ApiKeyRow / SPEC-007, extraído aquí en SPEC-012).
 */
export function DisabledTooltip({ tooltip, children }: DisabledTooltipProps): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
