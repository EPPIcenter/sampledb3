import type { Command } from '../../commands'
import type { CommandDependencies } from '../command-deps'

export function buildAdminCommands(d: CommandDependencies): Command[] {
  if (!d.isAdmin) return []

  return [
    {
      id: 'nav-admin-dashboard',
      label: 'Go to Admin Dashboard',
      category: 'Admin',
      keywords: ['admin', 'dashboard', 'admin dashboard'],
      action: () => d.navigate('/admin'),
    },
    {
      id: 'nav-admin-users',
      label: 'Go to User Management',
      category: 'Admin',
      keywords: ['admin', 'users', 'user management', 'manage users'],
      action: () => d.navigate('/admin/users'),
    },
    {
      id: 'nav-admin-settings',
      label: 'Go to System Settings',
      category: 'Admin',
      keywords: ['admin', 'system settings', 'admin settings'],
      action: () => d.navigate('/admin/settings'),
    },
    {
      id: 'nav-admin-statistics',
      label: 'Go to System Statistics',
      category: 'Admin',
      keywords: ['admin', 'system statistics', 'admin statistics'],
      action: () => d.navigate('/admin/statistics'),
    },
    {
      id: 'nav-admin-error-logs',
      label: 'Go to Error Logs',
      category: 'Admin',
      keywords: ['admin', 'error logs', 'logs', 'errors'],
      action: () => d.navigate('/admin/error-logs'),
    },
    {
      id: 'nav-admin-data-integrity',
      label: 'Go to Data Integrity',
      category: 'Admin',
      keywords: ['data integrity', 'integrity', 'admin'],
      action: () => d.navigate('/admin/data-integrity'),
    },
    {
      id: 'nav-admin-empty-collections',
      label: 'Data Integrity — Empty Collections',
      category: 'Admin',
      keywords: ['empty collections', 'integrity'],
      action: () => d.navigate('/admin/data-integrity/empty-collections'),
    },
    {
      id: 'nav-admin-integrity-report',
      label: 'Data Integrity — Report',
      category: 'Admin',
      keywords: ['integrity report', 'data integrity report'],
      action: () => d.navigate('/admin/data-integrity/report'),
    },
    ...(d.canManageReferenceData
      ? [
          {
            id: 'create-location',
            label: 'Create Location',
            category: 'Create' as const,
            keywords: ['create location', 'add location', 'new location'],
            description: 'Open the create location form',
            action: () => d.navigate('/locations?createLocation=true'),
          },
        ]
      : []),
  ]
}
