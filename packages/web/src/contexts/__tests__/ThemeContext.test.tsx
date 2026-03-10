import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme, THEME_IDS, THEME_LABELS } from '../ThemeContext'

function Consumer() {
  const { theme, setTheme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        Set dark
      </button>
      <button type="button" onClick={() => setTheme('sepia')}>
        Set sepia
      </button>
      <button type="button" onClick={toggleTheme}>
        Toggle
      </button>
    </div>
  )
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.removeItem('theme')
    document.documentElement.removeAttribute('data-theme')
  })

  it('provides theme and setTheme within ThemeProvider', () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    )
    expect(screen.getByTestId('theme-value')).toHaveTextContent('light')
  })

  it('default theme when no storage is one of THEME_IDS', () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    )
    const value = screen.getByTestId('theme-value').textContent
    expect(THEME_IDS).toContain(value)
  })

  it('setTheme updates context and persists to localStorage', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    )
    expect(screen.getByTestId('theme-value')).toHaveTextContent('light')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Set dark' }))
    })
    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('toggleTheme cycles through themes', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    )
    expect(screen.getByTestId('theme-value')).toHaveTextContent('light')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Toggle' }))
    })
    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Toggle' }))
    })
    expect(screen.getByTestId('theme-value')).toHaveTextContent('sepia')
  })
})

describe('Theme selector listbox', () => {
  beforeEach(() => {
    localStorage.removeItem('theme')
    document.documentElement.removeAttribute('data-theme')
  })

  function ThemeSelectorListbox() {
    const { theme, setTheme } = useTheme()
    return (
      <div role="listbox" aria-label="Theme">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="option"
            aria-selected={theme === id}
            onClick={() => setTheme(id)}
          >
            {THEME_LABELS[id]}
          </button>
        ))}
      </div>
    )
  }

  it('renders one option per THEME_IDS with correct labels', () => {
    render(
      <ThemeProvider>
        <ThemeSelectorListbox />
      </ThemeProvider>
    )
    const listbox = screen.getByRole('listbox', { name: 'Theme' })
    expect(listbox).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(THEME_IDS.length)
    THEME_IDS.forEach((id, index) => {
      expect(options[index]).toHaveTextContent(THEME_LABELS[id])
    })
  })

  it('marks current theme as selected and clicking an option sets theme', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeSelectorListbox />
      </ThemeProvider>
    )
    const options = screen.getAllByRole('option')
    const lightOption = options[THEME_IDS.indexOf('light')]
    const darkOption = options[THEME_IDS.indexOf('dark')]
    expect(lightOption).toHaveAttribute('aria-selected', 'true')
    expect(darkOption).toHaveAttribute('aria-selected', 'false')
    await act(async () => {
      await user.click(darkOption)
    })
    expect(darkOption).toHaveAttribute('aria-selected', 'true')
    expect(lightOption).toHaveAttribute('aria-selected', 'false')
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})
