import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { setContainerDefaults } from '../settings'
import { createTestUnit } from '../../__tests__/helpers/factories'
import {
  getDefaultUnit,
  getDefaultTotalQuantity,
  getDefaultRemainingQuantity,
  clearDefaultsCache,
} from '../defaults'
import type { Database } from '../../db/client'

describe('defaults', () => {
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

  describe('getDefaultUnit', () => {
    it('throws when container defaults are not configured', async () => {
      await expect(getDefaultUnit(testDb, 'micronix_tube')).rejects.toThrow(
        'Container defaults are not configured'
      )
    })

    it('throws when default unit symbol not configured for container type', async () => {
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: '' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await expect(getDefaultUnit(testDb, 'micronix_tube')).rejects.toThrow(
        "Default unit symbol not configured for container type 'micronix_tube'"
      )
    })

    it('throws when unit symbol not found in database', async () => {
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'nonexistent' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await expect(getDefaultUnit(testDb, 'micronix_tube')).rejects.toThrow(
        "Unit symbol 'nonexistent' not found"
      )
    })

    it('returns unit id when defaults and unit exist', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      const unitId = await getDefaultUnit(testDb, 'micronix_tube')
      expect(unitId).toBe(unit.id)
    })

    it('returns cached unit id on second call', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      const first = await getDefaultUnit(testDb, 'micronix_tube')
      const second = await getDefaultUnit(testDb, 'micronix_tube')
      expect(first).toBe(second)
    })
  })

  describe('getDefaultTotalQuantity', () => {
    it('throws when container defaults are not configured', async () => {
      await expect(getDefaultTotalQuantity(testDb, 'micronix_tube')).rejects.toThrow(
        'Container defaults are not configured'
      )
    })

    it('returns totalQuantity for container type', async () => {
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 100, remainingQuantity: 50, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      expect(await getDefaultTotalQuantity(testDb, 'micronix_tube')).toBe(100)
      expect(await getDefaultTotalQuantity(testDb, 'paper')).toBe(1)
    })
  })

  describe('getDefaultRemainingQuantity', () => {
    it('throws when container defaults are not configured', async () => {
      await expect(getDefaultRemainingQuantity(testDb, 'micronix_tube')).rejects.toThrow(
        'Container defaults are not configured'
      )
    })

    it('returns remainingQuantity for container type', async () => {
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 10, remainingQuantity: 8, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      expect(await getDefaultRemainingQuantity(testDb, 'micronix_tube')).toBe(8)
    })
  })

  describe('clearDefaultsCache', () => {
    it('clears all cache when db not passed', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await getDefaultUnit(testDb, 'micronix_tube')
      clearDefaultsCache()
      const afterClear = await getDefaultUnit(testDb, 'micronix_tube')
      expect(afterClear).toBe(unit.id)
    })

    it('clears cache for specific db when db passed', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await getDefaultUnit(testDb, 'micronix_tube')
      clearDefaultsCache(testDb)
      const afterClear = await getDefaultUnit(testDb, 'micronix_tube')
      expect(afterClear).toBe(unit.id)
    })
  })
})
