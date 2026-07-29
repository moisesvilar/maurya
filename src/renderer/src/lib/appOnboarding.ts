import type { AppOnboardingStatus } from '@/types/domain'

/** Los 8 pasos del onboarding de la app (SPEC-060), en su orden fijo. */
export type AppOnboardingStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface AppOnboardingInput {
  /** Agregado de db:onboarding:get-status (pasos 3-8 + destinos + marcas). */
  status: AppOnboardingStatus
  /** Del canal existente secrets:get-status; `configured` de cada clave. */
  anthropicConfigured: boolean
  deepgramConfigured: boolean
}

/** Una fila del banner, ya resuelta: literales, estado y destino navegable. */
export interface AppOnboardingStepView {
  step: AppOnboardingStepNumber
  /** Etiqueta literal de la tabla de la spec. */
  label: string
  /** Texto de apoyo de una línea; solo se pinta si el paso es el actual. */
  support: string
  /** Etiqueta literal del CTA. */
  ctaLabel: string
  done: boolean
  /** Ruta destino ya resuelta (incluye ids), lista para navigate(). */
  target: string
}

export interface AppOnboardingView {
  /** Siempre 8 filas, en orden 1..8. */
  steps: AppOnboardingStepView[]
  /** El «N» del contador «N de 8»: cuenta también los completados fuera de orden. */
  doneCount: number
  /** Primer paso no completado; null = los 8 completados (estado «¡Todo listo!»). */
  currentStep: AppOnboardingStepNumber | null
}

/** Literales fijos de cada paso (etiqueta, apoyo y CTA), tal cual la spec. */
const STEP_TEXTS: Record<
  AppOnboardingStepNumber,
  { label: string; support: string; ctaLabel: string }
> = {
  1: {
    label: 'Configura las claves de IA',
    support: 'Maurya necesita la clave de Claude para generar y la de Deepgram para transcribir.',
    ctaLabel: 'Ir a Ajustes'
  },
  2: {
    label: 'Revisa los prompts personalizados',
    support:
      'Los prompts definen cómo se comporta la IA; puedes personalizarlos o dejar los de serie.',
    ctaLabel: 'Revisar prompts'
  },
  3: {
    label: 'Crea las plantillas de preguntas y notas',
    support: 'Las plantillas de preguntas alimentan el guión y las de notas dan forma al resumen.',
    ctaLabel: 'Crear plantillas'
  },
  4: {
    label: 'Crea la primera empresa',
    support: 'Las entrevistas se organizan por la empresa a la que entrevistas.',
    ctaLabel: 'Crear empresa'
  },
  5: {
    label: 'Añade el primer contacto',
    support: 'Los contactos son las personas de la empresa que participan en las entrevistas.',
    ctaLabel: 'Añadir contacto'
  },
  6: {
    label: 'Crea el primer discovery',
    support: 'Un discovery agrupa todo el trabajo de descubrimiento de un problema.',
    ctaLabel: 'Crear discovery'
  },
  7: {
    label: 'Crea el primer grupo de entrevistas',
    support: 'Los grupos organizan las entrevistas de un discovery y fijan sus plantillas.',
    ctaLabel: 'Crear grupo'
  },
  8: {
    label: 'Crea la primera entrevista',
    support: 'Crea la entrevista desde el grupo: hereda su plantilla y sus objetivos.',
    ctaLabel: 'Crear entrevista'
  }
}

/**
 * Deriva las 8 filas del banner de primeros pasos (SPEC-060) del estado real de
 * la app — el paso NUNCA se persiste (patrón SPEC-058): si los datos cambian
 * (p. ej. se borra la última empresa), el banner avanza o retrocede solo en la
 * siguiente carga.
 *
 * Reglas no obvias, todas de la spec:
 * - El paso 1 exige AMBAS claves: el flujo completo necesita Claude para
 *   generar y Deepgram para transcribir.
 * - El paso 2 es el único no derivable de los datos (los prompts tienen
 *   defaults y «revisar» no deja huella): se apoya en la marca persistida.
 * - El paso 3 solo se completa con las DOS familias de plantillas, y su CTA
 *   apunta a la pestaña de la que falte, preguntas primero.
 * - El paso 8 exige entrevista CON grupo: una captura suelta no lo completa,
 *   porque el objetivo es recorrer el modelo completo.
 * - Los pasos completados fuera de orden llevan check aunque vayan después del
 *   actual (y suman al contador): con una empresa creada y sin claves, la
 *   cuenta es «1 de 8» y el paso actual sigue siendo el 1.
 *
 * La ocultación (`settings.hiddenAt`) NO se decide aquí: es del hook, para que
 * esta función sea total sobre los 8 pasos y trivialmente testeable.
 */
export function deriveAppOnboarding(input: AppOnboardingInput): AppOnboardingView {
  const { status, anthropicConfigured, deepgramConfigured } = input

  // Fallback defensivo de los destinos con id: cuando un paso es el actual su
  // id existe (el anterior estaría incompleto), pero el tipo admite null y
  // jamás debe construirse una URL con `undefined` dentro.
  const companyTarget =
    status.firstCompanyId === null ? '/companies' : `/companies/${status.firstCompanyId}`
  const discoveryTarget =
    status.firstDiscoveryId === null ? '/discoveries' : `/discoveries/${status.firstDiscoveryId}`
  const groupTarget =
    status.firstGroup === null
      ? '/discoveries'
      : `/discoveries/${status.firstGroup.discoveryId}/groups/${status.firstGroup.id}`

  const resolved: { step: AppOnboardingStepNumber; done: boolean; target: string }[] = [
    {
      step: 1,
      done: anthropicConfigured && deepgramConfigured,
      target: '/settings?tab=api-keys'
    },
    {
      step: 2,
      done: status.settings.promptsReviewedAt !== null,
      target: '/settings?tab=custom-prompts'
    },
    {
      step: 3,
      done: status.hasInterviewTemplate && status.hasNoteTemplate,
      target: status.hasInterviewTemplate
        ? '/settings?tab=note-templates'
        : '/settings?tab=interview-templates'
    },
    { step: 4, done: status.hasCompany, target: '/companies' },
    { step: 5, done: status.hasContact, target: companyTarget },
    { step: 6, done: status.hasDiscovery, target: '/discoveries' },
    { step: 7, done: status.hasInterviewGroup, target: discoveryTarget },
    { step: 8, done: status.hasGroupedInterview, target: groupTarget }
  ]

  const steps = resolved.map(({ step, done, target }) => ({
    step,
    ...STEP_TEXTS[step],
    done,
    target
  }))

  return {
    steps,
    doneCount: steps.filter((step) => step.done).length,
    currentStep: steps.find((step) => !step.done)?.step ?? null
  }
}
