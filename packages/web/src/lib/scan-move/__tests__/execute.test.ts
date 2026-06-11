import { describe, expect, it } from 'vitest'
import { buildMovePlan, buildPerFileResults, executeScanMove } from '../execute'
import { micronixScanMoveVariant } from '../variants'
import { containerInfo, makeFile, makeState, stubGateway } from './helpers'

function resolvedFromPlate(plateName: string, key: string) {
  return { identifierKey: key, container: containerInfo({ currentCollectionName: plateName }) }
}

describe('buildMovePlan', () => {
  it('builds moves for moving rows only and dedupes source mappings', () => {
    const files = [
      makeFile({
        selectedDestinationName: 'DEST-1',
        csvRows: [
          { container_barcode: 'BC1', target_position: 'A01' },
          { container_barcode: '', target_position: 'A02' },
        ],
        resolvedContainers: [resolvedFromPlate('SRC-1', 'BC1')],
      }),
      makeFile({
        selectedDestinationName: 'DEST-1',
        csvRows: [{ container_barcode: 'BC2', target_position: 'B01' }],
        resolvedContainers: [resolvedFromPlate('SRC-1', 'BC2')],
      }),
    ]
    const plan = buildMovePlan(files, micronixScanMoveVariant)
    if (!plan.ok) throw new Error('expected ok plan')
    expect(plan.moves).toEqual([
      { identifier: { type: 'barcode', barcode: 'BC1' }, targetPosition: 'A01', fileIndex: 0 },
      { identifier: { type: 'barcode', barcode: 'BC2' }, targetPosition: 'B01', fileIndex: 1 },
    ])
    expect(plan.mappings).toEqual([{ fromCollectionName: 'SRC-1', toCollectionName: 'DEST-1' }])
  })

  it('rejects one source plate mapping to two destinations', () => {
    const files = [
      makeFile({
        selectedDestinationName: 'DEST-1',
        csvRows: [{ container_barcode: 'BC1', target_position: 'A01' }],
        resolvedContainers: [resolvedFromPlate('SRC-1', 'BC1')],
      }),
      makeFile({
        selectedDestinationName: 'DEST-2',
        csvRows: [{ container_barcode: 'BC2', target_position: 'B01' }],
        resolvedContainers: [resolvedFromPlate('SRC-1', 'BC2')],
      }),
    ]
    const plan = buildMovePlan(files, micronixScanMoveVariant)
    expect(plan).toEqual({
      ok: false,
      error:
        'Source plate "SRC-1" appears in multiple files with different destinations: ' +
        '"DEST-1" and "DEST-2". Each source plate must map to a single destination.',
    })
  })
})

describe('buildPerFileResults', () => {
  it('attributes moved counts and row-ranged errors per file', () => {
    const files = [
      makeFile({
        filename: 'one.csv',
        selectedDestinationName: 'DEST-1',
        csvRows: [
          { container_barcode: 'BC1', target_position: 'A01' },
          { container_barcode: 'BC2', target_position: 'A02' },
        ],
      }),
      makeFile({
        filename: 'two.csv',
        selectedDestinationName: 'DEST-2',
        csvRows: [{ container_barcode: 'BC3', target_position: 'B01' }],
      }),
    ]
    const moves = [
      { identifier: { type: 'barcode' as const, barcode: 'BC1' }, targetPosition: 'A01', fileIndex: 0 },
      { identifier: { type: 'barcode' as const, barcode: 'BC2' }, targetPosition: 'A02', fileIndex: 0 },
      { identifier: { type: 'barcode' as const, barcode: 'BC3' }, targetPosition: 'B01', fileIndex: 1 },
    ]
    const results = buildPerFileResults(files, moves, {
      success: false,
      errors: [{ row: 2, error: 'occupied' }],
    })
    expect(results).toEqual([
      {
        filename: 'one.csv',
        destinationName: 'DEST-1',
        moved: 0,
        errors: [{ row: 2, error: 'occupied' }],
      },
      { filename: 'two.csv', destinationName: 'DEST-2', moved: 0, errors: [] },
    ])

    const successResults = buildPerFileResults(files, moves, { success: true })
    expect(successResults.map((r) => r.moved)).toEqual([2, 1])
  })
})

describe('executeScanMove', () => {
  const files = [
    makeFile({
      filename: 'one.csv',
      selectedDestinationName: 'DEST-1',
      csvRows: [{ container_barcode: 'BC1', target_position: 'A01' }],
      resolvedContainers: [resolvedFromPlate('SRC-1', 'BC1')],
    }),
  ]

  it('sends the planned request and reports success', async () => {
    let request: unknown
    const gateway = stubGateway({
      moveContainers: (req) => {
        request = req
        return Promise.resolve({ success: true, moved: 1 })
      },
    })
    const event = await executeScanMove(
      micronixScanMoveVariant,
      makeState({ files, atomicMode: 'best_effort' }),
      gateway,
    )
    expect(request).toEqual({
      collectionType: 'micronix_plate',
      atomicMode: 'best_effort',
      mappings: [{ fromCollectionName: 'SRC-1', toCollectionName: 'DEST-1' }],
      moves: [{ identifier: { type: 'barcode', barcode: 'BC1' }, targetPosition: 'A01' }],
    })
    if (event.type !== 'MOVE_COMPLETED') throw new Error('unexpected event')
    expect(event.result).toMatchObject({ success: true, moved: 1 })
    expect(event.result.fileResults).toEqual([
      { filename: 'one.csv', destinationName: 'DEST-1', moved: 1, errors: undefined },
    ])
  })

  it('returns a failed result without calling the API when the plan conflicts', async () => {
    const conflictedFiles = [
      files[0],
      makeFile({
        selectedDestinationName: 'DEST-2',
        csvRows: [{ container_barcode: 'BC2', target_position: 'B01' }],
        resolvedContainers: [resolvedFromPlate('SRC-1', 'BC2')],
      }),
    ]
    let called = false
    const gateway = stubGateway({
      moveContainers: () => {
        called = true
        return Promise.resolve({ success: true, moved: 0 })
      },
    })
    const event = await executeScanMove(
      micronixScanMoveVariant,
      makeState({ files: conflictedFiles }),
      gateway,
    )
    if (event.type !== 'MOVE_COMPLETED') throw new Error('unexpected event')
    expect(called).toBe(false)
    expect(event.result.success).toBe(false)
    expect(event.result.errors?.[0].error).toContain('multiple files with different destinations')
  })

  it('normalizes the standardized backend error body', async () => {
    const gateway = stubGateway({
      moveContainers: () =>
        Promise.reject(
          Object.assign(new Error('Request failed'), {
            response: {
              data: { error: 'move failed', moved: 2, errors: [{ row: 3, error: 'occupied' }] },
            },
          }),
        ),
    })
    const event = await executeScanMove(micronixScanMoveVariant, makeState({ files }), gateway)
    if (event.type !== 'MOVE_COMPLETED') throw new Error('unexpected event')
    expect(event.result).toEqual({
      success: false,
      moved: 2,
      errors: [{ row: 3, error: 'occupied' }],
    })
  })

  it('falls back to the error message when no body is present', async () => {
    const gateway = stubGateway({
      moveContainers: () => Promise.reject(new Error('network down')),
    })
    const event = await executeScanMove(micronixScanMoveVariant, makeState({ files }), gateway)
    if (event.type !== 'MOVE_COMPLETED') throw new Error('unexpected event')
    expect(event.result.errors).toEqual([{ row: 0, error: 'network down' }])
  })
})
