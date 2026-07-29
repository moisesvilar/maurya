import React from 'react'
import { PictureInPicture2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DetachedComponent } from '@/types/detached'

interface DetachWindowButtonProps {
  component: DetachedComponent
  interviewId: string
  testId: string
  ariaLabel: string
  /** Texto del Tooltip cuando el botón está habilitado. */
  tooltip: string
  /**
   * Motivo del deshabilitado (regla §5.4: deshabilitado SIEMPRE con
   * explicación); null cuando el botón está habilitado. Sustituye al tooltip.
   */
  disabledReason?: string | null
}

/**
 * Botón de desacople de un componente a su propia ventana (SPEC-062),
 * compartido por la sección del asistente y la cabecera del guión: icon-only
 * (acción secundaria que no debe competir con el contenido glanceable, regla
 * §10) con aria-label y Tooltip.
 *
 * La estructura del Tooltip es ÚNICA E INVARIABLE: el `<span tabIndex={0}>` va
 * siempre, esté el botón habilitado o no. Lección de SPEC-029 registrada en
 * MEMORY.md y reaplicada en SPEC-055-iter-1 (IconAction): si la envoltura
 * cambia entre disabled y enabled, React remonta el botón y el primer clic
 * tras habilitarse se pierde — y aquí el botón del asistente transita
 * `no-key → idle` en la vida real.
 */
export function DetachWindowButton({
  component,
  interviewId,
  testId,
  ariaLabel,
  tooltip,
  disabledReason = null
}: DetachWindowButtonProps): React.ReactElement {
  return (
    <Tooltip>
      {/* span intermedio: los elementos disabled no disparan eventos de hover */}
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={ariaLabel}
            data-testid={testId}
            disabled={disabledReason !== null}
            onClick={() => window.api.window.openDetached(component, interviewId)}
          >
            <PictureInPicture2 />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason ?? tooltip}</TooltipContent>
    </Tooltip>
  )
}
