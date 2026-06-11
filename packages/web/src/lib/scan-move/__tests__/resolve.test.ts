import { describe, expect, it } from 'vitest'
import {
  buildResolveIdentifiers,
  groupResolveResults,
  resolveScanMove,
  validateRelocations,
} from '../resolve'
import { cryovialScanMoveVariant, micronixScanMoveVariant } from '../variants'
import { containerInfo, makeFile, stubGateway } from './helpers'

describe('buildResolveIdentifiers', () => {
  it('micronix: skips empty-barcode rows (empty wells) and keys by barcode', () => {
    const files = [
      makeFile({
        csvRows: [
          { container_barcode: 'BC1', target_position: 'A01' },
          { container_barcode: '', target_position: 'A02' },
          { container_barcode: 'BC2', target_position: 'A03' },
        ],
      }),
    ]
    const entries = buildResolveIdentifiers(files, micronixScanMoveVariant)
    expect(entries.map((e) => e.key)).toEqual(['BC1', 'BC2'])
    expect(entries[1]).toMatchObject({ fileIndex: 0, rowIndex: 2 })
  })

  it('cryovial: every row moves, keyed by collection:position', () => {
    const files = [
      makeFile({
        csvRows: [
          { source_collection_name: 'BOX-1', source_position: 'A01', target_position: 'B01' },
        ],
      }),
    ]
    const entries = buildResolveIdentifiers(files, cryovialScanMoveVariant)
    expect(entries[0].key).toBe('BOX-1:A01')
    expect(entries[0].identifier).toEqual({
      type: 'position',
      sourceCollectionName: 'BOX-1',
      sourcePosition: 'A01',
    })
  })
})

describe('groupResolveResults', () => {
  const files = [
    makeFile({
      filename: 'one.csv',
      csvRows: [
        { container_barcode: 'BC1', target_position: 'A01' },
        { container_barcode: 'BC2', target_position: 'A02' },
      ],
    }),
    makeFile({
      filename: 'two.csv',
      csvRows: [{ container_barcode: 'BC3', target_position: 'B01' }],
    }),
  ]
  const entries = buildResolveIdentifiers(files, micronixScanMoveVariant)

  it('groups resolved and unresolved per file', () => {
    const outcomes = groupResolveResults(
      entries,
      [
        { identifier: 'BC1', container: containerInfo({ containerId: 1 }) },
        { identifier: { barcode: 'BC3' }, container: containerInfo({ containerId: 3 }) },
        { identifier: 'BC2', container: null },
      ],
      files,
      micronixScanMoveVariant,
    )
    expect(outcomes[0].resolvedContainers.map((r) => r.identifierKey)).toEqual(['BC1'])
    expect(outcomes[0].unresolvedContainers).toEqual([
      { identifierKey: 'BC2', rowIndex: 2, targetPosition: 'A02' },
    ])
    expect(outcomes[1].resolvedContainers.map((r) => r.identifierKey)).toEqual(['BC3'])
    expect(outcomes[1].unresolvedContainers).toEqual([])
    expect(outcomes.flatMap((o) => o.errors)).toEqual([])
  })

  it('flags files whose containers are not in the variant collection type', () => {
    const outcomes = groupResolveResults(
      entries,
      [
        {
          identifier: 'BC1',
          container: containerInfo({ currentCollectionType: 'cryovial_box' }),
        },
      ],
      files,
      micronixScanMoveVariant,
    )
    expect(outcomes[0].errors).toEqual([
      { row: 0, error: 'Some containers are not from micronix plates' },
    ])
    expect(outcomes[1].errors).toEqual([])
  })
})

describe('validateRelocations', () => {
  const baseFiles = [
    makeFile({
      selectedDestinationName: 'PLATE-A',
      csvRows: [
        { container_barcode: 'BC1', target_position: 'A01' },
        { container_barcode: '', target_position: 'A02' },
      ],
    }),
  ]

  it('errors when an emptied position currently holds a tube not relocated in the move', () => {
    const errors = validateRelocations(
      baseFiles,
      new Map([
        ['PLATE-A', { A02: { type: 'micronix_tube', barcode: 'ORPHAN' } }],
      ]),
      'plate',
    )
    expect(errors.get(0)).toEqual([
      {
        row: 0,
        error:
          'Position A02 on plate "PLATE-A" is empty in your upload but tube ORPHAN is currently there and is not relocated in this move.',
        kind: 'relocation',
      },
    ])
  })

  it('accepts an emptied position when the tube is relocated elsewhere in the same move', () => {
    const files = [
      makeFile({
        selectedDestinationName: 'PLATE-A',
        csvRows: [
          { container_barcode: 'ORPHAN', target_position: 'A05' },
          { container_barcode: '', target_position: 'A02' },
        ],
      }),
    ]
    const errors = validateRelocations(
      files,
      new Map([
        ['PLATE-A', { A02: { type: 'micronix_tube', barcode: 'ORPHAN' } }],
      ]),
      'plate',
    )
    expect(errors.size).toBe(0)
  })

  it('reports a missing destination instead of validating wells', () => {
    const errors = validateRelocations(baseFiles, new Map(), 'plate')
    expect(errors.get(0)).toEqual([
      {
        row: 0,
        error: 'Destination plate "PLATE-A" could not be found. Create it or select an existing plate.',
        kind: 'destination',
      },
    ])
  })
})

describe('resolveScanMove', () => {
  it('advances when resolution is clean', async () => {
    const files = [
      makeFile({
        selectedDestinationName: 'PLATE-A',
        csvRows: [{ container_barcode: 'BC1', target_position: 'A01' }],
      }),
    ]
    const gateway = stubGateway({
      resolveContainers: () =>
        Promise.resolve({ containers: [{ identifier: 'BC1', container: containerInfo() }] }),
      getDestinationWells: () => Promise.resolve({}),
    })
    const event = await resolveScanMove(micronixScanMoveVariant, files, {
      gateway,
      collections: [{ id: 5, name: 'PLATE-A' }],
    })
    if (event.type !== 'RESOLVE_COMPLETED') throw new Error('unexpected event')
    expect(event.advanced).toBe(true)
    expect(event.outcomes[0].resolvedContainers).toHaveLength(1)
  })

  it('blocks on relocation errors without failing the whole resolve', async () => {
    const files = [
      makeFile({
        selectedDestinationName: 'PLATE-A',
        csvRows: [
          { container_barcode: 'BC1', target_position: 'A01' },
          { container_barcode: '', target_position: 'A02' },
        ],
      }),
    ]
    const gateway = stubGateway({
      resolveContainers: () =>
        Promise.resolve({ containers: [{ identifier: 'BC1', container: containerInfo() }] }),
      getDestinationWells: () =>
        Promise.resolve({ A02: { type: 'micronix_tube', barcode: 'ORPHAN' } }),
    })
    const event = await resolveScanMove(micronixScanMoveVariant, files, {
      gateway,
      collections: [{ id: 5, name: 'PLATE-A' }],
    })
    if (event.type !== 'RESOLVE_COMPLETED') throw new Error('unexpected event')
    expect(event.advanced).toBe(false)
    expect(event.outcomes[0].errors[0].kind).toBe('relocation')
  })

  it('skips relocation validation for variants without the capability', async () => {
    const files = [
      makeFile({
        selectedDestinationName: 'BOX-1',
        csvRows: [
          { source_collection_name: 'BOX-2', source_position: 'A01', target_position: 'B01' },
        ],
      }),
    ]
    let wellsRequested = false
    const gateway = stubGateway({
      resolveContainers: () =>
        Promise.resolve({
          containers: [
            {
              identifier: { sourceCollectionName: 'BOX-2', sourcePosition: 'A01' },
              container: containerInfo({ currentCollectionType: 'cryovial_box' }),
            },
          ],
        }),
      getDestinationWells: () => {
        wellsRequested = true
        return Promise.resolve({})
      },
    })
    const event = await resolveScanMove(cryovialScanMoveVariant, files, { gateway, collections: [] })
    if (event.type !== 'RESOLVE_COMPLETED') throw new Error('unexpected event')
    expect(event.advanced).toBe(true)
    expect(wellsRequested).toBe(false)
  })

  it('maps gateway failures to RESOLVE_FAILED using the server error body when present', async () => {
    const gateway = stubGateway({
      resolveContainers: () =>
        Promise.reject(
          Object.assign(new Error('Request failed'), {
            response: { data: { error: 'resolve exploded' } },
          }),
        ),
    })
    const event = await resolveScanMove(micronixScanMoveVariant, [makeFile()], {
      gateway,
      collections: [],
    })
    expect(event).toEqual({ type: 'RESOLVE_FAILED', message: 'resolve exploded' })
  })
})
