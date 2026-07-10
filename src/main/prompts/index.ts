import type {
  CustomPrompt,
  CustomPromptId,
  CustomPromptOverride
} from '../../renderer/src/types/domain'
import { CUSTOM_PROMPT_IDS } from '../../renderer/src/types/domain'
import {
  getCustomPromptOverride,
  listCustomPromptOverrides,
  resetCustomPromptOverride,
  saveCustomPromptOverride
} from '../db/repository'
import { CUSTOM_PROMPT_DEFAULTS } from './defaults'

/**
 * Prompts de IA personalizables (SPEC-025): composición de la vista que
 * consume Ajustes (default + reglas bloqueadas + override) y resolución del
 * bloque de persona en cada uso (override guardado → default del módulo).
 */

function toView(id: CustomPromptId, override: CustomPromptOverride | null): CustomPrompt {
  const defaults = CUSTOM_PROMPT_DEFAULTS[id]
  return {
    id,
    defaultBody: defaults.persona,
    lockedRules: defaults.lockedRules,
    overrideBody: override?.body ?? null,
    updatedAt: override?.updatedAt ?? null
  }
}

/** Catálogo fijo (3 prompts, en el orden del listado de Ajustes) con su override vigente. */
export function listCustomPrompts(): CustomPrompt[] {
  const overrides = listCustomPromptOverrides()
  return CUSTOM_PROMPT_IDS.map((id) =>
    toView(id, overrides.find((override) => override.id === id) ?? null)
  )
}

/** Persiste el override y devuelve la vista compuesta actualizada. */
export function saveCustomPrompt(id: CustomPromptId, body: string): CustomPrompt {
  return toView(id, saveCustomPromptOverride(id, body))
}

/** Elimina el override (vuelve al default) y devuelve la vista compuesta. */
export function resetCustomPrompt(id: CustomPromptId): CustomPrompt {
  resetCustomPromptOverride(id)
  return toView(id, null)
}

/**
 * Bloque de persona/enfoque vigente para un prompt, re-evaluado en cada uso:
 * override guardado → default. Defensivo: si la persistencia no está
 * disponible (almacén sin inicializar, lectura fallida), la generación nunca
 * se rompe por esto — degrada al default.
 */
export function resolvePromptPersona(id: CustomPromptId): string {
  try {
    const override = getCustomPromptOverride(id)
    if (override !== null && override.body.trim() !== '') {
      return override.body
    }
  } catch {
    // Sin persistencia legible: default del módulo.
  }
  return CUSTOM_PROMPT_DEFAULTS[id].persona
}
