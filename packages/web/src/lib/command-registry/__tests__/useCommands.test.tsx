import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCommands } from '../registry'
import type { CommandDependencies } from '../command-deps'

const stable = {
  navigate: vi.fn() as CommandDependencies['navigate'],
  setTheme: vi.fn(),
  toggleHelpModal: vi.fn(),
  openSearchModal: vi.fn(),
  refreshUser: vi.fn(async () => {}),
  handleExportSpecimens: vi.fn(),
  handleExportInventory: vi.fn(),
  handleClearFilters: vi.fn(),
}

const deps = (overrides: Partial<CommandDependencies> = {}): CommandDependencies => ({
  ...stable,
  pathname: '/',
  search: '',
  canWrite: true,
  isAdmin: false,
  canManageReferenceData: false,
  theme: 'light',
  ...overrides,
})

describe('useCommands', () => {
  it('keeps the same commands when the caller passes a fresh but equal deps object', () => {
    const { result, rerender } = renderHook(({ d }) => useCommands(d), { initialProps: { d: deps() } })
    const first = result.current
    rerender({ d: deps() })
    expect(result.current).toBe(first)
  })

  it('rebuilds when the route or a permission changes', () => {
    const { result, rerender } = renderHook(({ d }) => useCommands(d), { initialProps: { d: deps() } })
    const first = result.current
    rerender({ d: deps({ search: '?q=1' }) })
    const second = result.current
    expect(second).not.toBe(first)
    rerender({ d: deps({ search: '?q=1', isAdmin: true }) })
    expect(result.current).not.toBe(second)
  })
})
