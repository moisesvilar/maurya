/**
 * Tests de las utilidades puras del tema (lib/theme): validación de la
 * preferencia, lectura/escritura defensiva en localStorage, resolución de
 * 'system' y aplicación de la clase `dark` + color-scheme al documento.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyTheme,
  initTheme,
  isThemePreference,
  readStoredTheme,
  persistTheme,
  resolveTheme,
  THEME_STORAGE_KEY
} from '@/lib/theme'

describe('lib/theme', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
  })

  describe('isThemePreference', () => {
    it('accepts the three valid preferences', () => {
      expect(isThemePreference('light')).toBe(true)
      expect(isThemePreference('dark')).toBe(true)
      expect(isThemePreference('system')).toBe(true)
    })

    it('rejects anything else', () => {
      expect(isThemePreference('blue')).toBe(false)
      expect(isThemePreference(null)).toBe(false)
      expect(isThemePreference(undefined)).toBe(false)
      expect(isThemePreference(1)).toBe(false)
    })
  })

  describe('readStoredTheme', () => {
    it('returns the stored preference when valid', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
      expect(readStoredTheme()).toBe('dark')
    })

    it('falls back to system when nothing is stored', () => {
      expect(readStoredTheme()).toBe('system')
    })

    it('falls back to system on a corrupted stored value', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'neon')
      expect(readStoredTheme()).toBe('system')
    })
  })

  describe('persistTheme', () => {
    it('stores the preference under the maurya:theme key', () => {
      persistTheme('light')
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    })
  })

  describe('resolveTheme', () => {
    it('resolves explicit preferences regardless of the OS setting', () => {
      expect(resolveTheme('dark', false)).toBe('dark')
      expect(resolveTheme('light', true)).toBe('light')
    })

    it('resolves system against the OS setting', () => {
      expect(resolveTheme('system', true)).toBe('dark')
      expect(resolveTheme('system', false)).toBe('light')
    })
  })

  describe('applyTheme', () => {
    it('adds the dark class and color-scheme when dark', () => {
      applyTheme('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.style.colorScheme).toBe('dark')
    })

    it('removes the dark class and sets light color-scheme when light', () => {
      document.documentElement.classList.add('dark')
      applyTheme('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.style.colorScheme).toBe('light')
    })
  })

  describe('initTheme', () => {
    it('applies the stored preference before first render', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
      initTheme()
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('defaults to the OS preference (light in jsdom) without stored value', () => {
      initTheme()
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })
})
