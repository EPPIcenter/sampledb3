import { describe, it, expect } from 'vitest'
import { fuzzyMatch, filterCommands, groupCommandsByCategory, type Command } from '../commands'

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

  describe('filterCommands', () => {
    const createCommand = (overrides: Partial<Command>): Command => ({
      id: 'cmd-1',
      label: 'Test Command',
      category: 'Navigation',
      keywords: ['test'],
      action: () => {},
      ...overrides,
    })

    it('returns all commands in context when query is empty', () => {
      const globalCmd = createCommand({ id: 'g', context: [] })
      const studiesCmd = createCommand({ id: 's', label: 'Studies', context: ['/studies'] })
      const commands = [globalCmd, studiesCmd]
      const result = filterCommands(commands, '', '/studies')
      expect(result.length).toBe(2)
    })

    it('filters by context when query is empty (only commands whose context matches currentPath)', () => {
      const studiesCmd = createCommand({ id: 's', label: 'Studies', context: ['/studies'] })
      const settingsCmd = createCommand({ id: 'set', label: 'Settings', context: ['/settings'] })
      const result = filterCommands([studiesCmd, settingsCmd], '', '/studies')
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('s')
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
      const studiesCmd = createCommand({ id: 's', label: 'Studies', context: ['/studies'] })
      const settingsCmd = createCommand({ id: 'set', label: 'Settings', context: ['/settings'] })
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
      expect(grouped['Navigation'].length).toBe(2)
      expect(grouped['Settings'].length).toBe(1)
    })
  })
})
