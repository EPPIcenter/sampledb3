import type { NavigateFunction, Location } from 'react-router-dom'
import type { Theme } from '../../contexts/ThemeContext'

/**
 * Dependencies injected from the app shell for building command lists.
 */
export interface CommandDependencies {
  navigate: NavigateFunction
  location: Location
  canWrite: boolean
  isAdmin: boolean
  canManageReferenceData: boolean
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleHelpModal: () => void
  openSearchModal: () => void
  refreshUser: () => Promise<void>
  handleExportSpecimens: () => void | Promise<void>
  handleExportInventory: () => void | Promise<void>
  handleClearFilters: () => void
}
