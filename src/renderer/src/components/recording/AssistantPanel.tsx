import React from 'react'
import { Link } from 'react-router-dom'
import { Loader2, PauseCircle, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatUsd } from '@/lib/aiCostFormat'
import { cn } from '@/lib/utils'
import type {
  AssistantAlarm,
  AssistantState,
  AssistantSuggestion,
  AssistantVote
} from '@/types/assistant'
import type { AiUsage } from '@/types/domain'
import type { LlmError } from '@/types/llm'

interface AssistantPanelProps {
  state: AssistantState
  suggestion: AssistantSuggestion | null
  error: LlmError | null
  vote: AssistantVote | null
  /** Uso de IA de la sesión (SPEC-021); null hasta el primer análisis. */
  usage: AiUsage | null
  /** Límite que provocó la pausa (SPEC-021); null si no está pausado. */
  pauseLimitUsd: number | null
  onVote: (vote: AssistantVote) => void
  /** Reanuda el asistente pausado por límite de coste (SPEC-021). */
  onResume: () => void
}

/** Chips de alarma The Mom Test: texto + color (regla 11.4). */
const ALARM_LABELS: Record<AssistantAlarm, string> = {
  compliment: 'Cumplido',
  generic: 'Genérico',
  hypothetical: 'Hipotético'
}

/**
 * Panel del asistente (SPEC-016): UNA sola sugerencia visible en su tamaño
 * justo — Badge de acción + pregunta + porqué — sin histórico en pantalla.
 * Proactividad silenciosa: nada de Toasts; "Analizando…" y los errores son
 * texto discreto que no oculta la sugerencia anterior.
 * SPEC-021: pausado por límite de coste, el Alert sustituye a la sugerencia
 * (información persistente que requiere una acción: "Reanudar asistente");
 * la línea de uso de la sesión es glanceable y visible también en pausa/error.
 */
export function AssistantPanel({
  state,
  suggestion,
  error,
  vote,
  usage,
  pauseLimitUsd,
  onVote,
  onResume
}: AssistantPanelProps): React.ReactElement {
  return (
    <Card className="border-primary/40 bg-primary/5 py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        {state === 'no-key' ? (
          <p className="text-sm text-muted-foreground">
            Asistente inactivo — configura tu clave de Anthropic en{' '}
            <Link to="/settings" className="font-medium underline underline-offset-4">
              Ajustes
            </Link>
          </p>
        ) : state === 'paused' ? (
          <Alert data-testid="assistant-paused-alert">
            <PauseCircle aria-hidden="true" />
            <AlertDescription>
              <p>
                Límite de coste alcanzado (${(pauseLimitUsd ?? 0).toFixed(2)}). El asistente está en
                pausa; la grabación y la transcripción continúan.
              </p>
              <Button variant="outline" size="sm" onClick={onResume}>
                Reanudar asistente
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {suggestion !== null && (
                <>
                  {suggestion.action === 'dig_deeper' ? (
                    <Badge className="bg-amber-500 text-white">Profundiza</Badge>
                  ) : (
                    <Badge className="bg-green-600 text-white">Continúa</Badge>
                  )}
                  {suggestion.alarms.map((alarm) => (
                    <Badge
                      key={alarm}
                      variant="outline"
                      className="border-amber-500 text-amber-600"
                    >
                      {ALARM_LABELS[alarm]}
                    </Badge>
                  ))}
                </>
              )}
              <div className="ml-auto flex items-center gap-2">
                {state === 'analyzing' && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    Analizando…
                  </span>
                )}
                {suggestion !== null && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Sugerencia útil"
                      className={cn(vote === 'up' && 'bg-accent text-accent-foreground')}
                      onClick={() => onVote('up')}
                    >
                      <ThumbsUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Sugerencia no útil"
                      className={cn(vote === 'down' && 'bg-accent text-accent-foreground')}
                      onClick={() => onVote('down')}
                    >
                      <ThumbsDown />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {suggestion !== null ? (
              <>
                <p className="text-base font-medium">{suggestion.suggestedQuestion}</p>
                <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                El asistente te sugerirá la siguiente pregunta en cuanto haya conversación.
              </p>
            )}
            {state === 'error' && error !== null && (
              <p className="text-sm text-muted-foreground">
                No se pudo analizar (se reintentará): {error.message}
              </p>
            )}
          </>
        )}
        {/* Línea de coste de sesión (SPEC-021): solo con ≥1 análisis completado */}
        {state !== 'no-key' && usage !== null && usage.calls >= 1 && (
          <p data-testid="assistant-usage-line" className="text-xs text-muted-foreground">
            IA: {usage.calls} llamadas · {formatUsd(usage.estimatedCostUsd)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
