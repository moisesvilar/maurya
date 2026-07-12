import type { ResolvedTheme, ThemePreference } from '@/types/theme'

/** Clave de persistencia de la preferencia de tema (patrón `maurya:*`). */
export const THEME_STORAGE_KEY = 'maurya:theme'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Lectura defensiva: valor inválido o localStorage inaccesible → 'system'. */
export function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemePreference(stored)) {
      return stored
    }
  } catch {
    // localStorage inaccesible: se cae a la preferencia del SO
  }
  return 'system'
}

/** Escritura defensiva: si falla, el tema sigue aplicando en memoria. */
export function persistTheme(theme: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Persistencia no disponible: el tema aplica solo a la sesión actual
  }
}

/** Ajuste del SO, con matchMedia defensivo (jsdom no lo implementa). */
export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

export function resolveTheme(theme: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (theme === 'system') {
    return systemDark ? 'dark' : 'light'
  }
  return theme
}

/**
 * Aplica el tema resuelto al documento: clase `dark` en <html> (la consumen
 * los tokens de main.css vía @custom-variant) + color-scheme, para que
 * scrollbars y controles nativos del renderer acompañen.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

/**
 * Pre-aplicación del tema ANTES del primer render de React (main.tsx): evita
 * el flash claro al arrancar en oscuro. No puede ser un script inline en
 * index.html porque el CSP del renderer no admite 'unsafe-inline' en scripts.
 */
export function initTheme(): void {
  applyTheme(resolveTheme(readStoredTheme(), systemPrefersDark()))
}
