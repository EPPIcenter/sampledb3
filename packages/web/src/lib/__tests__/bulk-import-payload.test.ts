import { describe, it, expect } from 'vitest'
import {
  buildCollectionLocationMap,
  buildSpecimensWithLocationIds,
  buildBulkCombinedRequestPayload,
  flatBulkContainerToWriteInput,
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

  it('flatBulkContainerToWriteInput nests micronix collection with locationId 0', () => {
    const write = flatBulkContainerToWriteInput(
      {
        containerType: 'micronix_tube',
        collectionName: 'Pl1',
        barcode: 'BC-1',
        position: 'A01',
      },
      new Map([['Pl1', 0]])
    )
    expect(write).toEqual({
      containerType: 'micronix_tube',
      barcode: 'BC-1',
      collection: {
        type: 'micronix_plate',
        name: 'Pl1',
        position: 'A01',
        locationId: 0,
      },
    })
  })

  it('buildSpecimensWithLocationIds nests collection.locationId 0', () => {
    const out = buildSpecimensWithLocationIds(
      [
        {
          sourceType: 'subject',
          subjectName: 'S1',
          specimenTypeName: 'T',
          container: { containerType: 'micronix_tube', collectionName: 'P1', barcode: 'BC-1' },
        },
      ],
      new Map([['P1', 0]])
    ) as { container: { collection?: { locationId?: number } } }[]
    expect(out[0].container.collection?.locationId).toBe(0)
  })

  it('buildSpecimensWithLocationIds nests collection.locationId from map', () => {
    const map = new Map([['P1', 5]])
    const out = buildSpecimensWithLocationIds(
      [
        {
          sourceType: 'subject',
          subjectName: 'S1',
          specimenTypeName: 'T',
          container: { containerType: 'micronix_tube', collectionName: 'P1', barcode: 'BC-1' },
        },
      ],
      map
    ) as { container: { collection?: { locationId?: number } } }[]
    expect(out[0].container.collection?.locationId).toBe(5)
    expect(out[0].container).not.toHaveProperty('collectionLocationId')
  })

  it('buildBulkCombinedRequestPayload nests collection.locationId when map resolves to root', () => {
    const p = buildBulkCombinedRequestPayload(
      [
        {
          studyShortCode: 'S',
          subjectName: 'Sub1',
          specimenTypeName: 'T',
          container: {
            containerType: 'micronix_tube',
            collectionName: 'Pl1',
            barcode: 'BC-1',
          },
        },
      ],
      {
        containerType: 'micronix_tube',
        fixedStudyShortCode: undefined,
        missingCollections: [{ name: 'Pl1', locationId: 0 }],
        atomicMode: 'per_subject',
      }
    )
    const c = p.subjects[0]!.specimens[0]!.container as {
      collection?: { locationId?: number }
    }
    expect(c.collection?.locationId).toBe(0)
    expect(c).not.toHaveProperty('collectionLocationId')
    expect(c).not.toHaveProperty('collectionName')
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
    expect(p).not.toHaveProperty('createCollections')
  })

  it('flatBulkContainerToWriteInput nests paper with box parent', () => {
    const write = flatBulkContainerToWriteInput(
      {
        containerType: 'paper',
        parentCollectionType: 'box',
        collectionName: 'Box-A',
        sheetName: 'Sheet-1',
        sublabel: 'Spot-A',
      },
      new Map()
    )
    expect(write).toEqual({
      containerType: 'paper',
      sublabel: 'Spot-A',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'box', name: 'Box-A' },
      },
    })
  })

  it('flatBulkContainerToWriteInput nests paper with bag parent', () => {
    const write = flatBulkContainerToWriteInput(
      {
        containerType: 'paper',
        parentCollectionType: 'bag',
        collectionName: 'Bag-A',
        sheetName: 'Sheet-1',
      },
      new Map([['Bag-A', 3]])
    )
    expect(write!.collection).toMatchObject({
      type: 'sheet',
      name: 'Sheet-1',
      parent: { type: 'bag', name: 'Bag-A', locationId: 3 },
    })
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
    expect(importPayload).not.toHaveProperty('createCollections')
  })
})
