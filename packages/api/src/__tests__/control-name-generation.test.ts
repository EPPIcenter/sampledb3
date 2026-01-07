import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from './helpers/db-setup'
import { createTestControlDefinition, createTestStrain } from './helpers/factories'
import type { Database } from '../db/client'
import {
  formatDensity,
  encodeStrainComposition,
  generateControlDefinitionName,
  generateUniqueControlDefinitionName,
} from '../lib/control-name-generation'

describe('Control Definition Name Generation', () => {
  let testDb: Database
  let sqlite: any

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

  describe('formatDensity', () => {
    it('should format zero as "0"', () => {
      expect(formatDensity(0)).toBe('0')
    })

    it('should format small decimals correctly', () => {
      expect(formatDensity(0.01)).toBe('0.01')
      expect(formatDensity(0.05)).toBe('0.05')
      expect(formatDensity(0.1)).toBe('0.1')
      expect(formatDensity(0.5)).toBe('0.5')
    })

    it('should format integers correctly', () => {
      expect(formatDensity(1)).toBe('1')
      expect(formatDensity(10)).toBe('10')
      expect(formatDensity(100)).toBe('100')
      expect(formatDensity(999)).toBe('999')
    })

    it('should format decimal numbers correctly', () => {
      expect(formatDensity(1.5)).toBe('1.5')
      expect(formatDensity(10.5)).toBe('10.5')
      expect(formatDensity(1.9)).toBe('1.9')
    })

    it('should format thousands with K notation', () => {
      expect(formatDensity(1000)).toBe('1K')
      expect(formatDensity(10000)).toBe('10K')
      expect(formatDensity(100000)).toBe('100K')
    })

    it('should format decimal thousands with K notation', () => {
      expect(formatDensity(1900)).toBe('1.9K')
      expect(formatDensity(1500)).toBe('1.5K')
      expect(formatDensity(2500)).toBe('2.5K')
    })

    it('should remove trailing zeros from decimals', () => {
      expect(formatDensity(1.0)).toBe('1')
      expect(formatDensity(10.0)).toBe('10')
      expect(formatDensity(1.50)).toBe('1.5')
    })
  })

  describe('encodeStrainComposition', () => {
    it('should return "Neg" for empty strains', () => {
      expect(encodeStrainComposition([])).toBe('Neg')
    })

    it('should use full strain name for single strain at 100%', () => {
      expect(encodeStrainComposition([{ name: '3D7', percentage: 100 }])).toBe('3D7')
      expect(encodeStrainComposition([{ name: 'W2', percentage: 100 }])).toBe('W2')
      expect(encodeStrainComposition([{ name: 'FCR3', percentage: 100 }])).toBe('FCR3')
    })

    it('should encode multiple strains with percentages', () => {
      const result = encodeStrainComposition([
        { name: 'FCR3', percentage: 99 },
        { name: 'V1S', percentage: 1 },
      ])
      // Should be sorted by percentage descending, then alphabetically
      expect(result).toBe('FCR99-V1S1')
    })

    it('should sort by percentage descending, then alphabetically', () => {
      const result = encodeStrainComposition([
        { name: 'V1S', percentage: 1 },
        { name: 'FCR3', percentage: 99 },
      ])
      // FCR3 should come first because it has higher percentage
      expect(result).toBe('FCR99-V1S1')
    })

    it('should handle strains with same percentage', () => {
      const result = encodeStrainComposition([
        { name: 'V1S', percentage: 50 },
        { name: 'FCR3', percentage: 50 },
      ])
      // Should sort alphabetically when percentages are equal
      expect(result).toBe('FCR50-V1S50')
    })

    it('should round percentages to integers', () => {
      const result = encodeStrainComposition([
        { name: 'FCR3', percentage: 99.7 },
        { name: 'V1S', percentage: 0.3 },
      ])
      expect(result).toBe('FCR100-V1S0')
    })

    it('should handle multiple strains', () => {
      const result = encodeStrainComposition([
        { name: 'FCR3', percentage: 70 },
        { name: 'V1S', percentage: 5 },
        { name: 'W2', percentage: 5 },
        { name: 'U659', percentage: 5 },
        { name: 'D10', percentage: 5 },
        { name: 'D6', percentage: 5 },
        { name: 'HB3', percentage: 5 },
      ])
      // Should be sorted by percentage descending
      expect(result).toContain('FCR70')
      expect(result.split('-').length).toBe(7)
    })

    it('should sanitize strain names with special characters', () => {
      const result = encodeStrainComposition([
        { name: 'Strain-Name', percentage: 100 },
      ])
      expect(result).toBe('STRAIN-NAME')
    })

    it('should use abbreviations for long strain names in multi-strain compositions', () => {
      const result = encodeStrainComposition([
        { name: 'VeryLongStrainName', percentage: 50 },
        { name: 'Short', percentage: 50 },
      ])
      // Should use first 2-3 characters
      expect(result).toContain('VER')
      expect(result).toContain('SHO')
    })
  })

  describe('generateControlDefinitionName', () => {
    it('should generate name for single strain', () => {
      const name = generateControlDefinitionName({
        controlType: 'blood',
        targetDensity: 0.1,
        strains: [{ id: 1, name: '3D7', percentage: 100 }],
      })
      expect(name).toBe('0.1_3D7')
    })

    it('should generate name for multiple strains', () => {
      const name = generateControlDefinitionName({
        controlType: 'blood',
        targetDensity: 1.0,
        strains: [
          { id: 1, name: 'FCR3', percentage: 99 },
          { id: 2, name: 'V1S', percentage: 1 },
        ],
      })
      expect(name).toBe('1_FCR99-V1S1')
    })

    it('should format density correctly in name', () => {
      expect(generateControlDefinitionName({
        controlType: 'blood',
        targetDensity: 1000,
        strains: [{ id: 1, name: '3D7', percentage: 100 }],
      })).toBe('1K_3D7')

      expect(generateControlDefinitionName({
        controlType: 'blood',
        targetDensity: 10000,
        strains: [{ id: 1, name: '3D7', percentage: 100 }],
      })).toBe('10K_3D7')

      expect(generateControlDefinitionName({
        controlType: 'blood',
        targetDensity: 0.1,
        strains: [{ id: 1, name: '3D7', percentage: 100 }],
      })).toBe('0.1_3D7')
    })

    it('should be deterministic - same inputs produce same name', () => {
      const data = {
        controlType: 'blood' as const,
        targetDensity: 1.0,
        strains: [
          { id: 1, name: 'FCR3', percentage: 99 },
          { id: 2, name: 'V1S', percentage: 1 },
        ],
      }
      const name1 = generateControlDefinitionName(data)
      const name2 = generateControlDefinitionName(data)
      expect(name1).toBe(name2)
    })

    it('should handle different order of strains consistently', () => {
      const data1 = {
        controlType: 'blood' as const,
        targetDensity: 1.0,
        strains: [
          { id: 1, name: 'FCR3', percentage: 99 },
          { id: 2, name: 'V1S', percentage: 1 },
        ],
      }
      const data2 = {
        controlType: 'blood' as const,
        targetDensity: 1.0,
        strains: [
          { id: 2, name: 'V1S', percentage: 1 },
          { id: 1, name: 'FCR3', percentage: 99 },
        ],
      }
      const name1 = generateControlDefinitionName(data1)
      const name2 = generateControlDefinitionName(data2)
      // Should produce same name regardless of input order
      expect(name1).toBe(name2)
    })
  })

  describe('generateUniqueControlDefinitionName', () => {
    it('should return base name if not taken', async () => {
      const name = await generateUniqueControlDefinitionName(testDb, {
        controlType: 'blood',
        targetDensity: 1.0,
        strains: [{ id: 1, name: '3D7', percentage: 100 }],
      })
      expect(name).toBe('1_3D7')
    })

    it('should append increment if base name exists', async () => {
      // Create a control definition with the base name
      await createTestControlDefinition(testDb, {
        name: '1_3D7',
        controlType: 'blood',
        properties: {
          targetDensity: 1.0,
          strains: [{ id: 1, name: '3D7', percentage: 100 }],
        },
      })

      const name = await generateUniqueControlDefinitionName(testDb, {
        controlType: 'blood',
        targetDensity: 1.0,
        strains: [{ id: 1, name: '3D7', percentage: 100 }],
      })
      expect(name).toBe('1_3D7_2')
    })

    it('should find next available increment', async () => {
      // Create multiple definitions with incremented names
      await createTestControlDefinition(testDb, {
        name: '1_3D7',
        controlType: 'blood',
      })
      await createTestControlDefinition(testDb, {
        name: '1_3D7_2',
        controlType: 'blood',
      })
      await createTestControlDefinition(testDb, {
        name: '1_3D7_3',
        controlType: 'blood',
      })

      const name = await generateUniqueControlDefinitionName(testDb, {
        controlType: 'blood',
        targetDensity: 1.0,
        strains: [{ id: 1, name: '3D7', percentage: 100 }],
      })
      expect(name).toBe('1_3D7_4')
    })

    it('should exclude specified ID when checking uniqueness', async () => {
      const existing = await createTestControlDefinition(testDb, {
        name: '1_3D7',
        controlType: 'blood',
      })

      const name = await generateUniqueControlDefinitionName(
        testDb,
        {
          controlType: 'blood',
          targetDensity: 1.0,
          strains: [{ id: 1, name: '3D7', percentage: 100 }],
        },
        existing.id
      )
      // Should return base name since we're excluding the existing one
      expect(name).toBe('1_3D7')
    })

    it('should handle names with different patterns correctly', async () => {
      // Create a name that looks similar but isn't an increment
      await createTestControlDefinition(testDb, {
        name: '1_3D7_other',
        controlType: 'blood',
      })

      await createTestControlDefinition(testDb, {
        name: '1_3D7',
        controlType: 'blood',
      })

      const name = await generateUniqueControlDefinitionName(testDb, {
        controlType: 'blood',
        targetDensity: 1.0,
        strains: [{ id: 1, name: '3D7', percentage: 100 }],
      })
      // Should increment from base name, ignoring the "other" variant
      expect(name).toBe('1_3D7_2')
    })
  })
})

