import { describe, it, expect } from 'vitest'
import {
  fuzzyMatch,
  filterCommands,
  groupCommandsByCategory,
  getOrderedCategorySections,
  commandContextMatches,
  type Command,
} from '../commands'

describe('commands', () => {
  describe('fuzzyMatch', () => {
    it('returns true for exact match (case insensitive)', () => {
      expect(fuzzyMatch('dashboard', 'Go to Dashboard')).toBe(true)
      expect(fuzzyMatch('Dashboard', 'dashboard')).toBe(true)
    })

    it('returns true when text contains query as substring', () => {
      expect(fuzzyMatch('board', 'Dashboard')).toBe(true)
      expect(fuzzyMatch('to', 'Go to Dashboard')).toBe(true)
    })

    it('returns true for character sequence match (e.g. "gd" matches "Go to Dashboard")', () => {
      expect(fuzzyMatch('gd', 'Go to Dashboard')).toBe(true)
      expect(fuzzyMatch('gtd', 'Go to Dashboard')).toBe(true)
    })

    it('returns false when query does not match', () => {
      expect(fuzzyMatch('xyz', 'Go to Dashboard')).toBe(false)
      expect(fuzzyMatch('gdx', 'Go to Dashboard')).toBe(false)
    })

    it('returns true when query is empty (empty string is contained)', () => {
      expect(fuzzyMatch('', 'Anything')).toBe(true)
    })
  })

  describe('commandContextMatches', () => {
    it('treats undefined context as always', () => {
      expect(commandContextMatches('/foo', undefined)).toBe(true)
    })

    it('matches exact routes', () => {
      const ctx = { kind: 'routes' as const, routes: [{ path: '/studies', match: 'exact' as const }] }
      expect(commandContextMatches('/studies', ctx)).toBe(true)
      expect(commandContextMatches('/studies/1', ctx)).toBe(false)
    })

    it('matches prefix routes without matching every path as home', () => {
      const ctx = { kind: 'routes' as const, routes: [{ path: '/studies', match: 'prefix' as const }] }
      expect(commandContextMatches('/studies/1', ctx)).toBe(true)
      expect(commandContextMatches('/', ctx)).toBe(false)
    })

    it('prefix / only matches home', () => {
      const ctx = { kind: 'routes' as const, routes: [{ path: '/', match: 'prefix' as const }] }
      expect(commandContextMatches('/', ctx)).toBe(true)
      expect(commandContextMatches('/studies', ctx)).toBe(false)
    })
  })

  describe('filterCommands', () => {
    const createCommand = (overrides: Partial<Command>): Command => ({
      id: 'cmd-1',
      label: 'Test Command',
      category: 'Navigation',
      keywords: ['test'],
      action: () => {},
      ...overrides,
    })

    it('returns all commands in context when query is empty (excluding hideFromEmptyList)', () => {
      const globalCmd = createCommand({ id: 'g', context: { kind: 'always' } })
      const hiddenCmd = createCommand({
        id: 'h',
        label: 'Hidden',
        hideFromEmptyList: true,
        context: { kind: 'always' },
      })
      const studiesCmd = createCommand({
        id: 's',
        label: 'Studies',
        context: { kind: 'routes', routes: [{ path: '/studies', match: 'prefix' }] },
      })
      const result = filterCommands([globalCmd, hiddenCmd, studiesCmd], '', '/studies')
      expect(result.map((c) => c.id).sort()).toEqual(['g', 's'])
    })

    it('filters by context when query is empty (only commands whose context matches currentPath)', () => {
      const studiesCmd = createCommand({
        id: 's',
        label: 'Studies',
        context: { kind: 'routes', routes: [{ path: '/studies', match: 'prefix' }] },
      })
      const settingsCmd = createCommand({
        id: 'set',
        label: 'Settings',
        context: { kind: 'routes', routes: [{ path: '/settings', match: 'exact' }] },
      })
      const result = filterCommands([studiesCmd, settingsCmd], '', '/studies')
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('s')
    })

    it('shows hideFromEmptyList commands when user types a query', () => {
      const hiddenCmd = createCommand({
        id: 'h',
        label: 'Hidden Nav',
        keywords: ['hidden'],
        hideFromEmptyList: true,
        context: { kind: 'always' },
      })
      const result = filterCommands([hiddenCmd], 'hidden', '/')
      expect(result.length).toBe(1)
    })

    it('filters by query matching label', () => {
      const cmd = createCommand({ id: '1', label: 'Go to Dashboard', keywords: ['dashboard'] })
      const result = filterCommands([cmd], 'dashboard', '/')
      expect(result.length).toBe(1)
      expect(result[0].label).toBe('Go to Dashboard')
    })

    it('filters by query matching keywords', () => {
      const cmd = createCommand({ id: '1', label: 'Dashboard', keywords: ['home', 'main'] })
      const result = filterCommands([cmd], 'home', '/')
      expect(result.length).toBe(1)
    })

    it('filters by query matching description', () => {
      const cmd = createCommand({
        id: '1',
        label: 'Something',
        keywords: [],
        description: 'Open dashboard page',
      })
      const result = filterCommands([cmd], 'dashboard', '/')
      expect(result.length).toBe(1)
    })

    it('excludes commands not in context when query is provided', () => {
      const studiesCmd = createCommand({
        id: 's',
        label: 'Studies',
        context: { kind: 'routes', routes: [{ path: '/studies', match: 'prefix' }] },
      })
      const settingsCmd = createCommand({
        id: 'set',
        label: 'Settings',
        context: { kind: 'routes', routes: [{ path: '/settings', match: 'exact' }] },
      })
      const result = filterCommands([studiesCmd, settingsCmd], 's', '/studies')
      expect(result.some((c) => c.id === 'set')).toBe(false)
    })
  })

  describe('groupCommandsByCategory', () => {
    it('groups commands by category', () => {
      const commands: Command[] = [
        { id: '1', label: 'A', category: 'Navigation', keywords: [], action: () => {} },
        { id: '2', label: 'B', category: 'Navigation', keywords: [], action: () => {} },
        { id: '3', label: 'C', category: 'Settings', keywords: [], action: () => {} },
      ]
      const grouped = groupCommandsByCategory(commands)
      expect(grouped['Navigation']?.length).toBe(2)
      expect(grouped['Settings']?.length).toBe(1)
    })
  })

  describe('getOrderedCategorySections', () => {
    it('orders sections by CATEGORY_ORDER and omits empty categories', () => {
      const commands: Command[] = [
        { id: '1', label: 'Nav', category: 'Navigation', keywords: [], action: () => {} },
        { id: '2', label: 'Act', category: 'Actions', keywords: [], action: () => {} },
      ]
      const sections = getOrderedCategorySections(commands)
      const cats = sections.map((s) => s.category)
      expect(cats.indexOf('Actions')).toBeLessThan(cats.indexOf('Navigation'))
    })
  })
})
