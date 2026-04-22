import type { Command } from '../../commands'
import type { CommandDependencies } from '../command-deps'

export function buildNavigationCommands(d: CommandDependencies): Command[] {
  const cmds: Command[] = [
    {
      id: 'nav-dashboard',
      label: 'Go to Dashboard',
      category: 'Navigation',
      keywords: ['dashboard', 'home', 'main'],
      action: () => d.navigate('/'),
    },
    {
      id: 'nav-studies',
      label: 'Go to Studies',
      category: 'Navigation',
      keywords: ['studies', 'study'],
      action: () => d.navigate('/studies'),
      hideFromEmptyList: true,
    },
    {
      id: 'nav-specimens',
      label: 'Go to Specimens',
      category: 'Navigation',
      keywords: ['specimens', 'specimen'],
      action: () => d.navigate('/specimens'),
      hideFromEmptyList: true,
    },
    {
      id: 'nav-statistics',
      label: 'Go to Statistics',
      category: 'Navigation',
      keywords: ['statistics', 'stats'],
      action: () => d.navigate('/statistics'),
      hideFromEmptyList: true,
    },
    {
      id: 'nav-locations',
      label: 'Go to Locations',
      category: 'Navigation',
      keywords: ['locations', 'location'],
      action: () => d.navigate('/locations'),
      hideFromEmptyList: true,
    },
    {
      id: 'nav-collections',
      label: 'Go to Collections',
      category: 'Navigation',
      keywords: ['collections', 'collection', 'plates', 'boxes', 'bags'],
      action: () => d.navigate('/collections'),
      hideFromEmptyList: true,
    },
    ...(d.canWrite
      ? [
          {
            id: 'nav-import',
            label: 'Go to Import',
            category: 'Navigation' as const,
            keywords: ['import'],
            action: () => d.navigate('/import'),
          },
        ]
      : []),
    {
      id: 'nav-controls',
      label: 'Go to Blood Controls',
      category: 'Navigation',
      keywords: ['controls', 'control', 'blood controls'],
      action: () => d.navigate('/blood-controls'),
    },
    {
      id: 'nav-derivations',
      label: 'Go to Derivations',
      category: 'Navigation',
      keywords: ['derivations', 'derivation'],
      action: () => d.navigate('/derivations'),
    },
    {
      id: 'nav-qpcr',
      label: 'Go to qPCR Experiments',
      category: 'Navigation',
      keywords: ['qpcr', 'pcr', 'experiments', 'q pcr'],
      action: () => d.navigate('/qpcr-experiments'),
    },
    {
      id: 'new-qpcr-experiment',
      label: 'New qPCR Experiment',
      category: 'Create',
      keywords: ['qpcr', 'new experiment', 'pcr'],
      action: () => d.navigate('/qpcr-experiments/new'),
    },
    {
      id: 'nav-profile',
      label: 'Go to My Profile',
      category: 'Navigation',
      keywords: ['profile', 'my profile', 'account'],
      action: () => d.navigate('/profile'),
      hideFromEmptyList: true,
    },
    {
      id: 'nav-settings',
      label: 'Go to Application Settings',
      category: 'Navigation',
      keywords: ['settings', 'setting', 'application'],
      action: () => d.navigate('/settings'),
      hideFromEmptyList: true,
    },
    {
      id: 'nav-reference-data',
      label: 'Go to Reference Data',
      category: 'Navigation',
      keywords: ['reference data', 'reference'],
      action: () => d.navigate('/reference-data'),
      hideFromEmptyList: true,
    },
    {
      id: 'nav-docs',
      label: 'Open Documentation',
      category: 'Navigation',
      keywords: ['documentation', 'docs', 'help', 'guide', 'manual'],
      action: () => {
        window.location.href = '/docs'
      },
    },
    {
      id: 'nav-derivations-import',
      label: 'Import Derivations',
      category: 'Navigation',
      keywords: ['derivations import', 'bulk import derivations', 'csv'],
      description: 'Open derivations bulk import',
      action: () => d.navigate('/derivations/import'),
    },
    {
      id: 'nav-blood-batches',
      label: 'Blood Control Batches',
      category: 'Navigation',
      keywords: ['batches', 'blood batches', 'control batches'],
      description: 'Open blood controls with the batches tab',
      action: () => d.navigate('/blood-controls?tab=batches'),
    },
  ]

  return cmds
}
