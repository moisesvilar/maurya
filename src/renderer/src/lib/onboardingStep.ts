import type { Interview } from '@/types/domain'

/** Paso del banner de onboarding (SPEC-058); `degraded` solo aplica al paso 5. */
export interface OnboardingStep {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7
  /** Paso 5 sin transcripción: la nota no se puede generar con IA. */
  degraded: boolean
}

export interface OnboardingStepInput {
  interview: Interview
  /** Existencia de la nota (0..1 por entrevista), resuelta por el caller. */
  hasNote: boolean
  /** Grabación en curso en la página: el banner no se muestra. */
  capturing: boolean
}

/**
 * Deriva el paso del banner de onboarding (SPEC-058) del estado real de la
 * entrevista — nunca se persiste el paso: si los datos cambian, el banner
 * avanza o retrocede solo. Devuelve null cuando el banner no debe mostrarse
 * (oculto por el usuario o grabación en curso).
 *
 * Reglas no obvias, todas de la spec:
 * - El paso 1 (plantilla) solo aplica mientras no hay guión: desasignar la
 *   plantilla con guión ya generado NO retrocede al 1.
 * - La nota manual cuenta (`hasNote`), no solo el status `summarized`: cubre
 *   el camino degradado sin transcripción.
 * - El orden 5→6 no es forzoso: con `objectiveResults` previos a la nota, al
 *   generarla se salta directamente al 7.
 * - La evaluación se considera resuelta si no hay nada que la IA pueda
 *   evaluar: sin objetivos, o sin transcripción (camino degradado, donde las
 *   marcas manuales de SPEC-028 son la vía) — el banner guía, no bloquea.
 */
export function deriveOnboardingStep(input: OnboardingStepInput): OnboardingStep | null {
  const { interview, hasNote, capturing } = input
  if (capturing || (interview.onboardingHiddenAt ?? null) !== null) {
    return null
  }
  const noteExists = hasNote || interview.status === 'summarized'
  const hasRecording =
    interview.wavPath !== null ||
    interview.status === 'recorded' ||
    interview.status === 'summarized'
  const hasScript = interview.scriptMarkdown !== null
  const hasTranscript = interview.transcriptPath !== null
  const evaluationDone =
    (interview.objectiveResults ?? null) !== null ||
    interview.objectives.length === 0 ||
    !hasTranscript

  if (noteExists && evaluationDone) {
    return { step: 7, degraded: false }
  }
  if (noteExists) {
    return { step: 6, degraded: false }
  }
  if (hasRecording) {
    return { step: 5, degraded: !hasTranscript }
  }
  if (hasScript) {
    return (interview.objectivesConfirmedAt ?? null) !== null
      ? { step: 4, degraded: false }
      : { step: 3, degraded: false }
  }
  return interview.templateId !== null ? { step: 2, degraded: false } : { step: 1, degraded: false }
}
