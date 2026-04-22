import { useMemo } from 'react'
import type { Command } from '../commands'
import type { CommandDependencies } from './command-deps'
import { buildNavigationCommands } from './groups/navigation'
import { buildExportCommands } from './groups/export-commands'
import { buildBulkCommands } from './groups/bulk'
import { buildCreateCommands } from './groups/create'
import { buildAdminCommands } from './groups/admin'
import { buildSystemCommands } from './groups/system'
import { buildContextualCommands } from './groups/contextual'

export function buildAllCommands(deps: CommandDependencies): Command[] {
  return [
    ...buildNavigationCommands(deps),
    ...buildExportCommands(deps),
    ...buildBulkCommands(deps),
    ...buildCreateCommands(deps),
    ...buildAdminCommands(deps),
    ...buildSystemCommands(deps),
    ...buildContextualCommands(deps),
  ]
}

export function useCommands(deps: CommandDependencies) {
  return useMemo(
    () => buildAllCommands(deps),
    [
      deps.navigate,
      deps.location.pathname,
      deps.location.search,
      deps.location.key,
      deps.canWrite,
      deps.isAdmin,
      deps.canManageReferenceData,
      deps.theme,
      deps.setTheme,
      deps.toggleHelpModal,
      deps.openSearchModal,
      deps.refreshUser,
      deps.handleExportSpecimens,
      deps.handleExportInventory,
      deps.handleClearFilters,
    ]
  )
}
