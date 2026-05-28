import { describe, it, expect } from 'vitest'
import {
  buildCollectionLocationMap,
  buildCreateCollectionsForBulkCombined,
  buildSpecimensWithLocationIds,
  buildBulkCombinedRequestPayload,
  toBulkCombinedImportRequest,
} from '../bulk-import-payload'

describe('bulk-import-payload', () => {
  it('buildCollectionLocationMap maps by name and barcode', () => {
    const m = buildCollectionLocationMap([
      { name: 'N1', locationId: 10, barcode: 'B1' },
    ])
    expect(m.get('N1')).toBe(10)
    expect(m.get('B1')).toBe(10)
  })

  it('buildCollectionLocationMap treats locationId 0 as valid', () => {
    const m = buildCollectionLocationMap([{ name: 'Root', locationId: 0, barcode: 'B0' }])
    expect(m.get('Root')).toBe(0)
    expect(m.get('B0')).toBe(0)
  })

  it('buildCreateCollectionsForBulkCombined does not treat locationId 0 as missing', () => {
    const created = buildCreateCollectionsForBulkCombined({
      atomicMode: 'full_file',
      collectionApiType: 'micronix_plate',
      missingCollections: [{ name: 'P', locationId: 0, barcode: 'X' }],
    })
    expect(created).toEqual([
      { type: 'micronix_plate', name: 'P', locationId: 0, barcode: 'X' },
    ])
  })

  it('buildSpecimensWithLocationIds preserves collection location id 0', () => {
    const out = buildSpecimensWithLocationIds(
      [
        {
          sourceType: 'subject',
          subjectName: 'S1',
          specimenTypeName: 'T',
          container: { collectionName: 'P1' },
        },
      ],
      new Map([['P1', 0]])
    ) as { container: { collectionLocationId: number } }[]
    expect(out[0].container.collectionLocationId).toBe(0)
  })

  it('buildSpecimensWithLocationIds attaches collectionLocationId', () => {
    const map = new Map([['P1', 5]])
    const out = buildSpecimensWithLocationIds(
      [
        {
          sourceType: 'subject',
          subjectName: 'S1',
          specimenTypeName: 'T',
          container: { collectionName: 'P1' },
        },
      ],
      map
    ) as { container: { collectionLocationId: number } }[]
    expect(out[0].container.collectionLocationId).toBe(5)
  })

  it('buildBulkCombinedRequestPayload attaches collectionLocationId 0 when map resolves to root', () => {
    const p = buildBulkCombinedRequestPayload(
      [
        {
          studyShortCode: 'S',
          subjectName: 'Sub1',
          specimenTypeName: 'T',
          container: { collectionName: 'Pl1' },
        },
      ],
      {
        containerType: 'micronix_tube',
        fixedStudyShortCode: undefined,
        missingCollections: [{ name: 'Pl1', locationId: 0 }],
        atomicMode: 'per_subject',
      }
    )
    const c = p.subjects[0]!.specimens[0]!.container as { collectionLocationId?: number }
    expect(c.collectionLocationId).toBe(0)
  })

  it('buildBulkCombinedRequestPayload groups by subject and carries rowIndex', () => {
    const p = buildBulkCombinedRequestPayload(
      [
        {
          studyShortCode: 'S',
          subjectName: 'Sub1',
          specimenTypeName: 'T',
          collectionDate: '2020-01-01',
        },
        {
          studyShortCode: 'S',
          subjectName: 'Sub1',
          specimenTypeName: 'T2',
        },
      ],
      { containerType: 'none', fixedStudyShortCode: undefined, missingCollections: [], atomicMode: 'per_subject' }
    )
    expect(p.studyShortCode).toBe('S')
    expect(p.subjects).toHaveLength(1)
    expect(p.subjects[0]!.specimens).toHaveLength(2)
    expect(p.subjects[0]!.specimens[0]!.rowIndex).toBe(1)
    expect(p.subjects[0]!.specimens[1]!.rowIndex).toBe(2)
  })

  it('toBulkCombinedImportRequest strips rowIndex for import POST', () => {
    const validatePayload = buildBulkCombinedRequestPayload(
      [
        {
          studyShortCode: 'S',
          subjectName: 'Sub1',
          specimenTypeName: 'T',
        },
      ],
      { containerType: 'none', fixedStudyShortCode: undefined, missingCollections: [], atomicMode: 'per_subject' }
    )
    const importPayload = toBulkCombinedImportRequest(validatePayload)
    expect(importPayload.subjects[0]!.specimens[0]).not.toHaveProperty('rowIndex')
    expect(validatePayload.subjects[0]!.specimens[0]!.rowIndex).toBe(1)
  })
})
