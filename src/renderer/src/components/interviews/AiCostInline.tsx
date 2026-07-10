import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTokenCount, formatUsd } from '@/lib/aiCostFormat'
import type { AiUsage } from '@/types/domain'

interface AiCostInlineProps {
  /** Acumulado de la entrevista; ausente/null/a cero → "Sin datos de coste". */
  aiUsage: AiUsage | null | undefined
}

/**
 * Segmento de coste de IA de la fila muted de referencias (SPEC-021),
 * compartido por InterviewDetailPage y CaptureDetailPage. Con datos: importe
 * "IA ~$X.XX" con Tooltip de desglose (llamadas y tokens de entrada/salida).
 * Sin `aiUsage` o a cero (entrevistas anteriores a la spec): "Sin datos de
 * coste" — mandan los ACs sobre el wireframe (decisión del plan, Riesgo 1) y
 * no se muestra importe alguno (sin "~$0.00" ruidoso).
 */
export function AiCostInline({ aiUsage }: AiCostInlineProps): React.ReactElement {
  if (aiUsage === null || aiUsage === undefined || aiUsage.calls === 0) {
    return <span>Sin datos de coste</span>
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-testid="interview-ai-cost">IA {formatUsd(aiUsage.estimatedCostUsd)}</span>
      </TooltipTrigger>
      <TooltipContent>
        {aiUsage.calls} llamadas · {formatTokenCount(aiUsage.inputTokens)} tokens entrada ·{' '}
        {formatTokenCount(aiUsage.outputTokens)} tokens salida
      </TooltipContent>
    </Tooltip>
  )
}
