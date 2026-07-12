import { useContext } from 'react'
import { ThemeContext, type ThemeContextValue } from '@/components/theme/themeContext'

/** Preferencia de tema actual y su setter (persiste y aplica al documento). */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
