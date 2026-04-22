import { createContext } from 'react'
import type { Theme } from './theme-types'

/** Stable module: `createContext` must not re-run on HMR of provider logic (see ThemeContext.tsx). */
export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
