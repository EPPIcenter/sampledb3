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
      { identifier: { type: 'barcode', barcode: 'BC1' }, targetPosition: 'A01', fileIndex: 0, csvRow: 1 },
      { identifier: { type: 'barcode', barcode: 'BC2' }, targetPosition: 'B01', fileIndex: 1, csvRow: 1 },
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
  // Scanner files list empty wells; the move request skips them, so the
  // endpoint's row numbers don't line up with CSV rows.
  const files = [
    makeFile({
      filename: 'one.csv',
      selectedDestinationName: 'DEST-1',
      csvRows: [
        { container_barcode: 'BC1', target_position: 'A01' },
        { container_barcode: '', target_position: 'A02' },
        { container_barcode: 'BC2', target_position: 'A03' },
      ],
    }),
    makeFile({
      filename: 'two.csv',
      selectedDestinationName: 'DEST-2',
      csvRows: [
        { container_barcode: '', target_position: 'A01' },
        { container_barcode: 'BC3', target_position: 'B01' },
      ],
    }),
  ]
  const plan = buildMovePlan(files, micronixScanMoveVariant)
  if (!plan.ok) throw new Error('unexpected plan failure')

  it('records each move with its file and CSV row', () => {
    expect(plan.moves.map((m) => [m.fileIndex, m.csvRow])).toEqual([
      [0, 1],
      [0, 3],
      [1, 2],
    ])
  })

  it('maps request rows back to the file and CSV row they came from', () => {
    const { fileResults, unattributed } = buildPerFileResults(files, plan.moves, {
      success: false,
      moved: 0,
      errors: [
        { row: 2, error: 'occupied' },
        { row: 3, error: 'not found' },
        { row: 0, error: 'Invalid collection mappings' },
      ],
    })
    expect(fileResults).toEqual([
      {
        filename: 'one.csv',
        destinationName: 'DEST-1',
        moved: 0,
        errors: [{ row: 3, error: 'occupied', filename: 'one.csv' }],
      },
      {
        filename: 'two.csv',
        destinationName: 'DEST-2',
        moved: 0,
        errors: [{ row: 2, error: 'not found', filename: 'two.csv' }],
      },
    ])
    expect(unattributed).toEqual([{ row: 0, error: 'Invalid collection mappings' }])
  })

  it('splits a best-effort partial result per file', () => {
    const { fileResults } = buildPerFileResults(files, plan.moves, {
      success: false,
      moved: 2,
      errors: [{ row: 3, error: 'not found' }],
    })
    expect(fileResults.map((r) => r.moved)).toEqual([2, 0])
  })

  it('leaves per-file counts unknown when a partial result does not add up', () => {
    const { fileResults } = buildPerFileResults(files, plan.moves, {
      success: false,
      moved: 1,
      errors: [{ row: 3, error: 'failed mid-way' }],
    })
    expect(fileResults.map((r) => r.moved)).toEqual([undefined, undefined])
  })

  it('counts every move on success', () => {
    const { fileResults } = buildPerFileResults(files, plan.moves, { success: true, moved: 3 })
    expect(fileResults.map((r) => r.moved)).toEqual([2, 1])
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
      { filename: 'one.csv', destinationName: 'DEST-1', moved: 1, errors: [] },
    ])
    expect(event.result.errors).toBeUndefined()
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
              data: { error: 'move failed', moved: 0, errors: [{ row: 1, error: 'occupied' }, { row: 9, error: 'odd' }] },
            },
          }),
        ),
    })
    const event = await executeScanMove(micronixScanMoveVariant, makeState({ files }), gateway)
    if (event.type !== 'MOVE_COMPLETED') throw new Error('unexpected event')
    expect(event.result).toEqual({
      success: false,
      moved: 0,
      // A row past the request can't be placed in a file.
      errors: [{ row: 0, error: 'odd' }],
      fileResults: [
        {
          filename: 'one.csv',
          destinationName: 'DEST-1',
          moved: 0,
          errors: [{ row: 1, error: 'occupied', filename: 'one.csv' }],
        },
      ],
    })
  })

  it('reports per-file errors when the move endpoint returns success: false', async () => {
    const gateway = stubGateway({
      moveContainers: () =>
        Promise.resolve({ success: false, moved: 0, errors: [{ row: 1, error: 'occupied' }] }),
    })
    const event = await executeScanMove(micronixScanMoveVariant, makeState({ files }), gateway)
    if (event.type !== 'MOVE_COMPLETED') throw new Error('unexpected event')
    expect(event.result.errors).toBeUndefined()
    expect(event.result.fileResults?.[0].errors).toEqual([
      { row: 1, error: 'occupied', filename: 'one.csv' },
    ])
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
