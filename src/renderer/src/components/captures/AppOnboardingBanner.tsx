import React from 'react'
import { CheckCircle2, Circle, CircleDot, PartyPopper, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useAppOnboarding } from '@/hooks/useAppOnboarding'
import { cn } from '@/lib/utils'
import type { AppOnboardingStepView } from '@/lib/appOnboarding'

const TOTAL_STEPS = 8

/**
 * Banner de primeros pasos de la app (SPEC-060), en la home (`/captures`) entre
 * la cabecera de la página y el listado. Es una checklist de 8 pasos DERIVADA
 * del estado real (claves + almacén), no un wizard: cada paso se completa en su
 * superficie nativa y el CTA solo navega hasta allí — el banner nunca duplica
 * formularios. Única excepción: el CTA del paso 2 además persiste la marca de
 * revisión, porque navegar a los prompts ES el gesto de revisión.
 *
 * Se autogobierna (sin props): consume useAppOnboarding y devuelve null
 * mientras carga, si la derivación falla o si el usuario lo ocultó — ni
 * skeleton ni placeholder (la derivación es local y un skeleton daría flash).
 * No comparte nada con el banner de SPEC-058, que es per-entrevista y toma el
 * relevo a partir del paso 8.
 */
export function AppOnboardingBanner(): React.ReactElement | null {
  const navigate = useNavigate()
  const { state, markPromptsReviewed, hide } = useAppOnboarding()

  if (state.status !== 'ready') {
    return null
  }

  const { steps, doneCount, currentStep } = state.view

  const handleAction = async (step: AppOnboardingStepView): Promise<void> => {
    // El fallo de la marca no bloquea la navegación (el banner guía, no audita).
    if (step.step === 2) {
      await markPromptsReviewed()
    }
    void navigate(step.target)
  }

  const stateOf = (step: AppOnboardingStepView): 'done' | 'current' | 'pending' => {
    if (step.done) {
      return 'done'
    }
    return step.step === currentStep ? 'current' : 'pending'
  }

  return (
    <Card data-testid="app-onboarding-banner" className="gap-4 py-4">
      <CardHeader className="flex flex-col gap-2 px-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Primeros pasos con Maurya</h2>
          <span className="text-sm text-muted-foreground">
            {doneCount} de {TOTAL_STEPS}
          </span>
        </div>
        <Button
          data-testid="app-onboarding-hide"
          variant="ghost"
          size="sm"
          className="self-start md:self-auto"
          onClick={() => void hide()}
        >
          <X />
          Ocultar
        </Button>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="flex flex-col gap-2">
          {steps.map((step) => {
            const rowState = stateOf(step)
            return (
              <li
                key={step.step}
                data-testid={`app-onboarding-step-${step.step}`}
                data-state={rowState}
                className="flex items-start gap-2"
              >
                {rowState === 'done' && (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-500"
                    aria-hidden="true"
                  />
                )}
                {rowState === 'current' && (
                  <CircleDot className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                )}
                {rowState === 'pending' && (
                  <Circle
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span
                    className={cn(
                      'text-sm',
                      rowState === 'current' && 'font-semibold',
                      rowState === 'pending' && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                  {rowState === 'current' && (
                    <>
                      <span className="text-sm text-muted-foreground">{step.support}</span>
                      <Button
                        data-testid="app-onboarding-action"
                        className="w-full md:w-auto md:self-start"
                        onClick={() => void handleAction(step)}
                      >
                        {step.ctaLabel}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {currentStep === null && (
          <p className="mt-4 flex items-center gap-2 text-sm">
            <PartyPopper className="size-5 shrink-0" aria-hidden="true" />
            ¡Todo listo! Ya tienes Maurya configurado y tu primera entrevista creada.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
