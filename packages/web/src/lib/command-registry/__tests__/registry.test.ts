import { describe, it, expect, vi } from 'vitest'
import { buildAllCommands } from '../registry'
import type { CommandDependencies } from '../command-deps'

function mockDeps(overrides: Partial<CommandDependencies> = {}): CommandDependencies {
  return {
    navigate: vi.fn() as CommandDependencies['navigate'],
    pathname: '/',
    search: '',
    canWrite: true,
    isAdmin: false,
    canCreateLocations: false,
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

  it('includes Create Location for a member, without the admin commands', () => {
    const cmds = buildAllCommands(mockDeps({ canCreateLocations: true }))
    expect(cmds.some((c) => c.id === 'create-location')).toBe(true)
    expect(cmds.some((c) => c.category === 'Admin')).toBe(false)
  })

  it('includes Create Location for an admin', () => {
    const cmds = buildAllCommands(mockDeps({ isAdmin: true, canCreateLocations: true }))
    expect(cmds.filter((c) => c.id === 'create-location')).toHaveLength(1)
  })

  it('omits Create Location for a viewer', () => {
    const cmds = buildAllCommands(mockDeps({ canWrite: false }))
    expect(cmds.some((c) => c.id === 'create-location')).toBe(false)
  })

  it('offers Create Child Location on a Location page to a member and an admin', () => {
    for (const isAdmin of [false, true]) {
      const cmds = buildAllCommands(mockDeps({ isAdmin, canCreateLocations: true, pathname: '/locations/7' }))
      expect(cmds.some((c) => c.id === 'ctx-location-add-child')).toBe(true)
    }
  })

  it('omits Create Child Location for a viewer, and keeps the other Location page commands', () => {
    const cmds = buildAllCommands(mockDeps({ canWrite: false, pathname: '/locations/7' }))
    expect(cmds.some((c) => c.id === 'ctx-location-add-child')).toBe(false)
    expect(cmds.some((c) => c.id === 'ctx-location-copy-url')).toBe(true)
    expect(cmds.some((c) => c.id === 'ctx-location-print')).toBe(true)
  })

  it('opens the create form with the parent chosen from Create Child Location', () => {
    const navigate = vi.fn()
    const cmds = buildAllCommands(
      mockDeps({
        canCreateLocations: true,
        pathname: '/locations/7',
        navigate: navigate as CommandDependencies['navigate'],
      }),
    )
    cmds.find((c) => c.id === 'ctx-location-add-child')?.action()
    expect(navigate).toHaveBeenCalledWith('/locations?createLocation=true&parentId=7')
  })

  it('opens the create form on the Locations page from Create Location', () => {
    const navigate = vi.fn()
    const cmds = buildAllCommands(
      mockDeps({ canCreateLocations: true, navigate: navigate as CommandDependencies['navigate'] }),
    )
    cmds.find((c) => c.id === 'create-location')?.action()
    expect(navigate).toHaveBeenCalledWith('/locations?createLocation=true')
  })
})
