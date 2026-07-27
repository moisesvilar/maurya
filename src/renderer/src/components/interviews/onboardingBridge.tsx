import React, { useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { Note } from '@/types/domain'

/**
 * Acción de sección espejada en el banner de onboarding (SPEC-058): la
 * sección sigue siendo la única dueña de su estado (busy, prerrequisitos) y
 * de la ejecución; el banner solo la refleja y la dispara.
 */
export interface OnboardingSectionAction {
  /** Acción en curso (el banner muestra su spinner y se deshabilita). */
  busy: boolean
  /** Prerrequisito incumplido: el botón del banner va disabled. */
  disabled: boolean
  /** Motivo del disabled (Tooltip, regla 5.4); null si está habilitada. */
  disabledReason: string | null
  run: () => void
}

/**
 * Mitad de registro del puente (SPEC-058): valor ESTABLE — las secciones
 * dependen de él en efectos y no debe cambiar de identidad al registrarse
 * una acción (evita el bucle registro → re-render → re-registro).
 */
interface OnboardingRegistry {
  registerNoteAction: (action: OnboardingSectionAction | null) => void
  registerObjectivesAction: (action: OnboardingSectionAction | null) => void
  /** NoteScriptSections se entera de una nota creada fuera (paso 5 degradado). */
  registerNoteCreatedListener: (listener: ((note: Note) => void) | null) => void
  notifyNoteCreated: (note: Note) => void
}

/** Mitad de lectura del puente: lo que consume el banner. */
interface OnboardingActions {
  note: OnboardingSectionAction | null
  objectives: OnboardingSectionAction | null
}

// Dos contextos a propósito (patrón TopBarSlotContext, SPEC-034): el de
// registro es estable (lo consumen las secciones) y el de lectura cambia con
// cada acción registrada (lo consume solo el banner). Fuera del provider
// (tests que montan secciones sueltas) ambos valen null y todo es no-op.
// eslint-disable-next-line react-refresh/only-export-components
export const OnboardingRegistryContext = React.createContext<OnboardingRegistry | null>(null)
// eslint-disable-next-line react-refresh/only-export-components
export const OnboardingActionsContext = React.createContext<OnboardingActions | null>(null)

interface OnboardingBridgeProviderProps {
  children: React.ReactNode
}

/**
 * Proveedor del puente banner↔secciones (SPEC-058): lo montan las dos
 * páginas de detalle envolviendo banner + Objetivos + Nota/Guión.
 */
export function OnboardingBridgeProvider({
  children
}: OnboardingBridgeProviderProps): React.ReactElement {
  const [note, setNote] = useState<OnboardingSectionAction | null>(null)
  const [objectives, setObjectives] = useState<OnboardingSectionAction | null>(null)
  const noteCreatedListenerRef = useRef<((note: Note) => void) | null>(null)

  const registerNoteCreatedListener = useCallback(
    (listener: ((note: Note) => void) | null): void => {
      noteCreatedListenerRef.current = listener
    },
    []
  )
  const notifyNoteCreated = useCallback((note: Note): void => {
    noteCreatedListenerRef.current?.(note)
  }, [])

  const registry = useMemo<OnboardingRegistry>(
    () => ({
      registerNoteAction: setNote,
      registerObjectivesAction: setObjectives,
      registerNoteCreatedListener,
      notifyNoteCreated
    }),
    [registerNoteCreatedListener, notifyNoteCreated]
  )
  const actions = useMemo<OnboardingActions>(() => ({ note, objectives }), [note, objectives])

  return (
    <OnboardingRegistryContext.Provider value={registry}>
      <OnboardingActionsContext.Provider value={actions}>
        {children}
      </OnboardingActionsContext.Provider>
    </OnboardingRegistryContext.Provider>
  )
}

/** Registro null-safe (no-op sin provider). */
// eslint-disable-next-line react-refresh/only-export-components
export function useOnboardingRegistry(): OnboardingRegistry | null {
  return useContext(OnboardingRegistryContext)
}

/** Lectura null-safe (el banner sin provider no espeja ninguna acción). */
// eslint-disable-next-line react-refresh/only-export-components
export function useOnboardingActions(): OnboardingActions | null {
  return useContext(OnboardingActionsContext)
}
