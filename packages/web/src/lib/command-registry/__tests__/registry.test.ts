import { describe, it, expect, vi } from 'vitest'
import { buildAllCommands } from '../registry'
import type { CommandDependencies } from '../command-deps'

function mockDeps(overrides: Partial<CommandDependencies> = {}): CommandDependencies {
  return {
    navigate: vi.fn() as CommandDependencies['navigate'],
    location: { pathname: '/', search: '', hash: '', state: null, key: 'default' },
    canWrite: true,
    isAdmin: false,
    canManageReferenceData: false,
    theme: 'light',
    setTheme: vi.fn(),
    toggleHelpModal: vi.fn(),
    openSearchModal: vi.fn(),
    refreshUser: vi.fn(async () => {}),
    handleExportSpecimens: vi.fn(),
    handleExportInventory: vi.fn(),
    handleClearFilters: vi.fn(),
    ...overrides,
  }
}

describe('command registry', () => {
  it('buildAllCommands includes dashboard navigation', () => {
    const cmds = buildAllCommands(mockDeps())
    expect(cmds.some((c) => c.id === 'nav-dashboard')).toBe(true)
  })

  it('includes admin commands when isAdmin', () => {
    const cmds = buildAllCommands(mockDeps({ isAdmin: true }))
    expect(cmds.some((c) => c.id === 'nav-admin-dashboard')).toBe(true)
  })

  it('includes create location when canManageReferenceData', () => {
    const cmds = buildAllCommands(mockDeps({ isAdmin: true, canManageReferenceData: true }))
    expect(cmds.some((c) => c.id === 'create-location')).toBe(true)
  })
})
