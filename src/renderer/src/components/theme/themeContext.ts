import { createContext } from 'react'
import type { ThemePreference } from '@/types/theme'

export interface ThemeContextValue {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

/**
 * Contexto con fallback inerte (patrón next-themes): un componente montado
 * fuera del ThemeProvider (tests de piezas sueltas) lee 'system' y un
 * setTheme noop en lugar de lanzar. Vive en su propio módulo para que
 * ThemeProvider.tsx solo exporte componentes (react-refresh).
 */
export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => undefined
})
