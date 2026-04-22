import {
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { ThemeContext, type ThemeContextValue } from './theme-context-instance'
import { THEME_IDS, type Theme } from './theme-types'

export { THEME_IDS, THEME_LABELS, type Theme } from './theme-types'

const STORAGE_KEY = 'theme'

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored && THEME_IDS.includes(stored)) return stored
  const dataTheme = document.documentElement.dataset.theme
  if (dataTheme && THEME_IDS.includes(dataTheme as Theme)) return dataTheme as Theme
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const i = THEME_IDS.indexOf(prev)
      return THEME_IDS[(i + 1) % THEME_IDS.length]
    })
  }, [])

  const value: ThemeContextValue = {
    theme,
    setTheme,
    toggleTheme,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
