import type { NavigateFunction } from 'react-router-dom'
import type { Theme } from '../../contexts/ThemeContext'

/**
 * Dependencies injected from the app shell for building command lists.
 * Keep every field a primitive or a stable function: useCommands rebuilds when any field changes.
 */
export interface CommandDependencies {
  navigate: NavigateFunction
  /** Current route; the only parts of the location commands read. */
  pathname: string
  search: string
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
