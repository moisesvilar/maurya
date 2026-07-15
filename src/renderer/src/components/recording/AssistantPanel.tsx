import React from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, PauseCircle, Pin, PinOff, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatUsd } from '@/lib/aiCostFormat'
import type {
  AssistantAlarm,
  AssistantQueue,
  AssistantQueueItem,
  AssistantQuestionOutcome,
  AssistantState
} from '@/types/assistant'
import type { AiUsage } from '@/types/domain'
import type { LlmError } from '@/types/llm'

interface AssistantPanelProps {
  state: AssistantState
  /** Cola de preguntas de la sesión (SPEC-036): pendientes + ancladas. */
  queue: AssistantQueue
  error: LlmError | null
  /** Uso de IA de la sesión (SPEC-021); null hasta el primer análisis. */
  usage: AiUsage | null
  /** Límite que provocó la pausa (SPEC-021); null si no está pausado. */
  pauseLimitUsd: number | null
  /** Ancla/desancla una pregunta de la cola (SPEC-036). */
  onSetPinned: (itemId: string, pinned: boolean) => void
  /** Descarta o marca respondida una pregunta de la cola (SPEC-039). */
  onResolveItem: (itemId: string, outcome: AssistantQuestionOutcome) => void
  /** Reanuda el asistente pausado por límite de coste (SPEC-021). */
  onResume: () => void
}

/** Chips de alarma The Mom Test: texto + color (regla 11.4). */
const ALARM_LABELS: Record<AssistantAlarm, string> = {
  compliment: 'Cumplido',
  generic: 'Genérico',
  hypothetical: 'Hipotético'
}

interface ItemActionsProps {
  item: AssistantQueueItem
  /** true en la sección «Ancladas»: el tercer botón pasa a «Desanclar pregunta». */
  pinned: boolean
  onSetPinned: (itemId: string, pinned: boolean) => void
  onResolveItem: (itemId: string, outcome: AssistantQuestionOutcome) => void
}

/**
 * Grupo de tres acciones inline de un ítem (SPEC-039): «Marcar respondida»,
 * «Descartar pregunta» y «Anclar/Desanclar pregunta», icon-only con aria-label
 * y Tooltip (regla §10: el panel es glanceable). Descartar y responder son
 * atómicas e inmediatas, sin confirmación ni Toast: el coste del error es bajo
 * y una confirmación rompería la atención en directo; el diálogo de motivos
 * del final actúa de red.
 */
function ItemActions({
  item,
  pinned,
  onSetPinned,
  onResolveItem
}: ItemActionsProps): React.ReactElement {
  return (
    <div className="ml-auto flex shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Marcar respondida"
            data-testid="assistant-item-answered"
            onClick={() => onResolveItem(item.id, 'answered')}
          >
            <Check />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Respondida: actualiza los objetivos</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Descartar pregunta"
            data-testid="assistant-item-discard"
            onClick={() => onResolveItem(item.id, 'discarded')}
          >
            <X />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Descartar: al finalizar se te pedirá el porqué</TooltipContent>
      </Tooltip>
      {pinned ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Desanclar pregunta"
              onClick={() => onSetPinned(item.id, false)}
            >
              <PinOff />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Desanclar: vuelve a pendientes</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Anclar pregunta"
              onClick={() => onSetPinned(item.id, true)}
            >
              <Pin />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Anclar: la pregunta no se resuelve sola</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

/** Badge de acción + chips de alarma de un ítem (fila 1, con wrap responsive). */
function ItemBadges({ item }: { item: AssistantQueueItem }): React.ReactElement {
  return (
    <>
      {item.action === 'dig_deeper' ? (
        <Badge className="bg-amber-500 text-white">Profundiza</Badge>
      ) : (
        <Badge className="bg-green-600 text-white">Continúa</Badge>
      )}
      {item.alarms.map((alarm) => (
        <Badge
          key={alarm}
          variant="outline"
          className="border-amber-500 text-amber-600 dark:border-amber-400 dark:text-amber-400"
        >
          {ALARM_LABELS[alarm]}
        </Badge>
      ))}
    </>
  )
}

/**
 * Panel del asistente (SPEC-016 + SPEC-036): cola de preguntas pendientes que
 * persisten hasta resolverse (anti-descarte), la más reciente primero, más la
 * sección «Ancladas» (solo si hay ≥1). Cada ítem en su tamaño justo: Badge de
 * acción + chips de alarma + pregunta + porqué (las ancladas omiten el porqué).
 * Anclar/desanclar es una acción atómica inline reversible: sin confirmación
 * ni Toast (el ítem cambia de sección de inmediato). Proactividad silenciosa:
 * «Analizando…» y los errores son texto discreto que no oculta la cola.
 * SPEC-021: pausado por límite de coste, el Alert sustituye a la lista
 * (información persistente que requiere una acción: «Reanudar asistente»);
 * la línea de uso de la sesión es glanceable y visible también en pausa/error.
 */
export function AssistantPanel({
  state,
  queue,
  error,
  usage,
  pauseLimitUsd,
  onSetPinned,
  onResolveItem,
  onResume
}: AssistantPanelProps): React.ReactElement {
  const queueEmpty = queue.pending.length === 0 && queue.pinned.length === 0
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
            {/* Indicador de análisis arriba a la derecha, sin desplazar la lista */}
            {state === 'analyzing' && (
              <div className="flex justify-end">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Analizando…
                </span>
              </div>
            )}
            {queueEmpty ? (
              <p className="text-sm text-muted-foreground">
                El asistente te sugerirá la siguiente pregunta en cuanto haya conversación.
              </p>
            ) : (
              <>
                {queue.pending.length > 0 && (
                  <div data-testid="assistant-queue" className="flex flex-col gap-2">
                    {queue.pending.map((item) => (
                      <div
                        key={item.id}
                        data-testid="assistant-queue-item"
                        className="flex flex-col gap-1 rounded-md border p-2"
                      >
                        <div className="flex flex-wrap items-start gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <ItemBadges item={item} />
                          </div>
                          {/* SPEC-039: respondida / descartar / anclar */}
                          <ItemActions
                            item={item}
                            pinned={false}
                            onSetPinned={onSetPinned}
                            onResolveItem={onResolveItem}
                          />
                        </div>
                        <p className="text-base font-medium">{item.suggestedQuestion}</p>
                        <p className="text-sm text-muted-foreground">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
                {/* Sección «Ancladas» (SPEC-036): solo si hay ≥1; sin porqué */}
                {queue.pinned.length > 0 && (
                  <div data-testid="assistant-pinned-section" className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Ancladas</p>
                    {queue.pinned.map((item) => (
                      <div
                        key={item.id}
                        data-testid="assistant-pinned-item"
                        className="flex flex-col gap-1 rounded-md border p-2"
                      >
                        <div className="flex flex-wrap items-start gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <ItemBadges item={item} />
                          </div>
                          {/* SPEC-039: respondida / descartar / desanclar */}
                          <ItemActions
                            item={item}
                            pinned
                            onSetPinned={onSetPinned}
                            onResolveItem={onResolveItem}
                          />
                        </div>
                        <p className="text-base font-medium">{item.suggestedQuestion}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
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
