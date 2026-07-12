import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeContext, type ThemeContextValue } from '@/components/theme/themeContext'
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  systemPrefersDark
} from '@/lib/theme'
import type { ThemePreference } from '@/types/theme'

/**
 * Gobierna el tema de la app: estado con lazy init desde localStorage, clase
 * `dark` sobre <html> en cada cambio, propagación a main (nativeTheme) y
 * seguimiento en vivo del ajuste del SO cuando la preferencia es 'system'.
 * El primer paint lo cubre initTheme() en main.tsx; aquí se re-aplica de
 * forma idempotente.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme)

  useEffect(() => {
    applyTheme(resolveTheme(theme, systemPrefersDark()))
    // Fire-and-forget hacia main: la barra de título y los diálogos nativos
    // acompañan al tema elegido. Defensivo: en tests el bridge puede faltar.
    window.api?.window.setTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') {
      return
    }
    let query: MediaQueryList
    try {
      query = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return
    }
    const onChange = (event: MediaQueryListEvent): void => {
      applyTheme(resolveTheme('system', event.matches))
    }
    query.addEventListener('change', onChange)
    return (): void => {
      query.removeEventListener('change', onChange)
    }
  }, [theme])

  const setTheme = useCallback((next: ThemePreference): void => {
    persistTheme(next)
    setThemeState(next)
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
