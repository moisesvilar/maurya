/**
 * Preferencia de tema de la app: 'system' sigue el ajuste del SO; 'light' y
 * 'dark' lo fijan explícitamente. El renderer gobierna la preferencia (la
 * persiste en localStorage y aplica la clase `dark` al documento) y la
 * propaga a main vía `window:set-theme` para que el chrome nativo
 * (nativeTheme: barra de título, diálogos) acompañe.
 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** Tema efectivo tras resolver 'system' contra el ajuste del SO. */
export type ResolvedTheme = 'light' | 'dark'
