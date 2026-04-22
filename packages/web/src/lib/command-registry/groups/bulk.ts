import type { Command } from '../../commands'
import type { CommandDependencies } from '../command-deps'

export function buildBulkCommands(d: CommandDependencies): Command[] {
  if (!d.canWrite) return []
  return [
    {
      id: 'move-micronix',
      label: 'Move Micronix Containers',
      category: 'Bulk Operations',
      keywords: ['move micronix', 'container move micronix'],
      action: () => d.navigate('/container-move/micronix'),
    },
    {
      id: 'move-cryovial',
      label: 'Move Cryovial Containers',
      category: 'Bulk Operations',
      keywords: ['move cryovial', 'container move cryovial'],
      action: () => d.navigate('/container-move/cryovial'),
    },
    {
      id: 'move-papers',
      label: 'Move Papers',
      category: 'Bulk Operations',
      keywords: ['move papers', 'container move papers'],
      action: () => d.navigate('/container-move/papers'),
    },
    {
      id: 'move-collections',
      label: 'Move Collections',
      category: 'Bulk Operations',
      keywords: ['move collections', 'collection move'],
      action: () => d.navigate('/collection-move'),
    },
  ]
}
