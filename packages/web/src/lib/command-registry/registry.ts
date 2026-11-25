import { useMemo } from 'react'
import { useShallowStable } from '../../hooks/useShallowStable'
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

export function useCommands(deps: CommandDependencies): Command[] {
  // The caller builds a new deps object each render; keep the last one while its fields are unchanged.
  const stableDeps = useShallowStable(deps)
  return useMemo(() => buildAllCommands(stableDeps), [stableDeps])
}
