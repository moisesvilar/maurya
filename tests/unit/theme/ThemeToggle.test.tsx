/**
 * Tests del selector de tema (ThemeProvider + ThemeToggle): cambio de
 * preferencia desde el dropdown, aplicación de la clase `dark` al documento,
 * persistencia en localStorage y propagación a main vía window.api (para que
 * nativeTheme acompañe). Fallback: fuera del provider el toggle no lanza.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { THEME_STORAGE_KEY } from '@/lib/theme'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

describe('ThemeToggle (dark mode)', () => {
  let mock: MockApiHandle

  beforeEach(() => {
    window.localStorage.clear()
    mock = installMockApi()
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
  })

  function renderToggle(): void {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    )
  }

  it('switches to dark: class on <html>, persisted and propagated to main', async () => {
    const user = userEvent.setup()
    renderToggle()

    await user.click(screen.getByRole('button', { name: 'Cambiar tema' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Oscuro' }))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(mock.api.window.setTheme).toHaveBeenLastCalledWith('dark')
  })

  it('switches back to light and removes the dark class', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const user = userEvent.setup()
    renderToggle()

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Cambiar tema' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Claro' }))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(mock.api.window.setTheme).toHaveBeenLastCalledWith('light')
  })

  it('marks the stored preference as the checked option', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const user = userEvent.setup()
    renderToggle()

    await user.click(screen.getByRole('button', { name: 'Cambiar tema' }))

    expect(screen.getByRole('menuitemradio', { name: 'Oscuro' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('menuitemradio', { name: 'Sistema' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('system preference resolves against the OS setting (light in jsdom)', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    renderToggle()

    await user.click(screen.getByRole('button', { name: 'Cambiar tema' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Sistema' }))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
    expect(mock.api.window.setTheme).toHaveBeenLastCalledWith('system')
  })

  it('does not throw when mounted outside the provider (inert fallback)', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'Cambiar tema' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Oscuro' }))

    // Fallback inerte: sin provider no se aplica ni persiste nada
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })
})
