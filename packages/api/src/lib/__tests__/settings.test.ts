import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  getSetting,
  setSetting,
  getTableViewConfigurations,
  setTableViewConfigurations,
  DEFAULT_TABLE_VIEW_CONFIGURATIONS,
} from '../settings'
import type { Database } from '../../db/client'

describe('settings lib', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('getSetting', () => {
    it('returns null for missing key', async () => {
      const value = await getSetting<string>(testDb, 'nonexistent_key')
      expect(value).toBeNull()
    })

    it('returns null for missing key with user id', async () => {
      const value = await getSetting<string>(testDb, 'user_setting', 1)
      expect(value).toBeNull()
    })
  })

  describe('setSetting and getSetting', () => {
    it('set then get returns value for system key', async () => {
      await setSetting(testDb, 'test_key', { foo: 'bar' }, null)
      const value = await getSetting<{ foo: string }>(testDb, 'test_key', null)
      expect(value).toEqual({ foo: 'bar' })
    })

    it('set then get returns value for user-scoped key', async () => {
      await setSetting(testDb, 'user_key', 'user_value', 1)
      const value = await getSetting<string>(testDb, 'user_key', 1)
      expect(value).toBe('user_value')
    })

    it('system and user key are independent', async () => {
      await setSetting(testDb, 'same_key', 'system', null)
      await setSetting(testDb, 'same_key', 'user1', 1)
      const systemVal = await getSetting<string>(testDb, 'same_key', null)
      const userVal = await getSetting<string>(testDb, 'same_key', 1)
      expect(systemVal).toBe('system')
      expect(userVal).toBe('user1')
    })
  })

  describe('table view configurations', () => {
    it('getTableViewConfigurations lazy-initializes default when empty', async () => {
      const configs = await getTableViewConfigurations(testDb)
      expect(configs).not.toBeNull()
      expect(configs?.configurations).toHaveLength(1)
      expect(configs?.configurations[0].name).toBe('Default')
      expect(configs?.configurations[0].columns).toEqual(DEFAULT_TABLE_VIEW_CONFIGURATIONS.configurations[0].columns)
      expect(configs?.configurations[0].isDefault).toBe(true)
    })

    it('setTableViewConfigurations persists and get returns it', async () => {
      const custom = {
        configurations: [
          { name: 'Browse', columns: ['position', 'barcode', 'status'], isDefault: true },
        ],
      }
      await setTableViewConfigurations(testDb, custom)
      const configs = await getTableViewConfigurations(testDb)
      expect(configs).toEqual(custom)
    })
  })
})
