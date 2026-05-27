import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { createTestControlDefinition, createTestStrain } from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import {
  strainCompositionMatches,
  targetDensityMatches,
  definitionCompositionMatches,
  parseStoredProperties,
  normalizeStoredStrains,
  buildBloodControlPropertiesPayload,
  findBloodControlDefinitionByComposition,
} from '../strain-composition'

describe('strain-composition', () => {
  describe('pure helpers', () => {
    it('strainCompositionMatches compares ids and percentages within tolerance', () => {
      const stored = [{ id: 2, percentage: 50 }, { id: 1, percentage: 50 }]
      expect(
        strainCompositionMatches(
          [
            { strainId: 1, percentage: 50 },
            { strainId: 2, percentage: 50 },
          ],
          stored
        )
      ).toBe(true)
      expect(strainCompositionMatches([{ strainId: 1, percentage: 60 }], stored)).toBe(false)
    })

    it('targetDensityMatches respects required vs optional density mode', () => {
      const stored = { targetDensity: 1000, targetDensityUnitId: 3 }
      expect(targetDensityMatches(stored, { targetDensity: 1000, targetDensityUnitId: 3 }, 'required')).toBe(
        true
      )
      expect(targetDensityMatches(stored, { targetDensity: 500 }, 'required')).toBe(false)
      expect(targetDensityMatches(stored, {}, 'optional')).toBe(false)
    })

    it('definitionCompositionMatches combines density and strains', () => {
      const props = { targetDensity: 100, targetDensityUnitId: 1, strains: [{ id: 5, percentage: 100 }] }
      expect(
        definitionCompositionMatches(props, {
          strains: [{ strainId: 5, percentage: 100 }],
          targetDensity: 100,
          targetDensityUnitId: 1,
        })
      ).toBe(true)
    })

    it('parseStoredProperties and normalizeStoredStrains handle JSON and numeric entries', () => {
      expect(parseStoredProperties('{"strains":[1]}')?.strains).toEqual([1])
      expect(normalizeStoredStrains([{ id: 3, percentage: 25 }])).toEqual([{ id: 3, percentage: 25 }])
      expect(normalizeStoredStrains([7])).toEqual([{ id: 7 }])
    })

    it('buildBloodControlPropertiesPayload includes unit metadata', () => {
      const payload = buildBloodControlPropertiesPayload(
        [{ id: 1, name: 'A', percentage: 100 }],
        500,
        2,
        'cells/mL'
      )
      expect(payload.targetDensity).toBe(500)
      expect(payload.targetDensityUnitId).toBe(2)
      expect(payload.targetDensityUnitSymbol).toBe('cells/mL')
    })
  })

  describe('database', () => {
    let testDb: Database
    let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

    beforeEach(async () => {
      const setup = await setupTestDatabase()
      testDb = setup.db
      sqlite = setup.sqlite
    })

    afterEach(() => {
      if (sqlite) cleanupTestDatabase(sqlite)
    })

    it('findBloodControlDefinitionByComposition returns matching blood definition', async () => {
      const strain = await createTestStrain(testDb, { name: 'Match strain' })
      await createTestControlDefinition(testDb, {
        name: 'Composition A',
        controlType: 'blood',
        properties: {
          strains: [{ id: strain.id, percentage: 100 }],
          targetDensity: 1000,
        },
      })

      const found = await findBloodControlDefinitionByComposition(testDb, {
        strains: [{ strainId: strain.id, percentage: 100 }],
        targetDensity: 1000,
      })

      expect(found?.name).toBe('Composition A')
    })
  })
})
