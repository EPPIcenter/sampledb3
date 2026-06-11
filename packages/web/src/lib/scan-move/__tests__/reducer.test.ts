import { describe, expect, it } from 'vitest'
import { initialScanMoveState, planNextFromUpload, scanMoveReducer } from '../reducer'
import { cryovialScanMoveVariant, micronixScanMoveVariant } from '../variants'
import { makeFile, makeState } from './helpers'

describe('scanMoveReducer', () => {
  it('FILES_INGESTED replaces files, clears the previous result, and returns to upload', () => {
    const state = makeState({
      step: 'execute',
      files: [makeFile({ filename: 'old.csv' })],
      moveResult: { success: true, moved: 3 },
    })
    const next = scanMoveReducer(state, {
      type: 'FILES_INGESTED',
      files: [makeFile({ filename: 'new.csv' })],
    })
    expect(next.files.map((f) => f.filename)).toEqual(['new.csv'])
    expect(next.moveResult).toBeNull()
    expect(next.step).toBe('upload')
  })

  it('guards every step against an empty file list', () => {
    const state = makeState({ step: 'resolve', files: [makeFile()] })
    const next = scanMoveReducer(state, { type: 'FILE_REMOVED', fileIndex: 0 })
    expect(next.files).toHaveLength(0)
    expect(next.step).toBe('upload')

    const jumped = scanMoveReducer(makeState(), { type: 'STEP_SET', step: 'resolve' })
    expect(jumped.step).toBe('upload')
  })

  it('DESTINATION_SELECTED clears resolution and destination-caused errors but keeps format errors', () => {
    const state = makeState({
      files: [
        makeFile({
          selectedDestinationName: 'PLATE-A',
          isResolved: true,
          resolvedContainers: [{ identifierKey: 'BC1', container: { containerId: 1 } as never }],
          validationErrors: [
            { row: 2, error: 'target_position is required but missing or empty' },
            { row: 0, error: 'tube orphaned', kind: 'relocation' },
            { row: 0, error: 'must select', kind: 'destination' },
          ],
        }),
      ],
    })
    const next = scanMoveReducer(state, { type: 'DESTINATION_SELECTED', fileIndex: 0, name: 'PLATE-B' })
    const file = next.files[0]
    expect(file.selectedDestinationName).toBe('PLATE-B')
    expect(file.isResolved).toBe(false)
    expect(file.resolvedContainers).toHaveLength(0)
    expect(file.validationErrors).toEqual([
      { row: 2, error: 'target_position is required but missing or empty' },
    ])
  })

  it('RESOLVE_COMPLETED advances only when flagged, and replaces stale relocation errors', () => {
    const state = makeState({
      files: [
        makeFile({
          validationErrors: [{ row: 0, error: 'old relocation', kind: 'relocation' }],
        }),
      ],
    })
    const outcome = {
      fileIndex: 0,
      resolvedContainers: [{ identifierKey: 'BC1', container: { containerId: 1 } as never }],
      unresolvedContainers: [],
      errors: [{ row: 0, error: 'new relocation', kind: 'relocation' as const }],
    }

    const blocked = scanMoveReducer(state, {
      type: 'RESOLVE_COMPLETED',
      outcomes: [outcome],
      advanced: false,
    })
    expect(blocked.step).toBe('upload')
    expect(blocked.files[0].isResolved).toBe(true)
    expect(blocked.files[0].validationErrors).toEqual([
      { row: 0, error: 'new relocation', kind: 'relocation' },
    ])

    const advanced = scanMoveReducer(state, {
      type: 'RESOLVE_COMPLETED',
      outcomes: [{ ...outcome, errors: [] }],
      advanced: true,
    })
    expect(advanced.step).toBe('resolve')
    // No new errors: the stale relocation error from the prior attempt stays untouched
    // only when the outcome carries errors; a clean outcome leaves prior errors as-is.
    expect(advanced.files[0].resolvedContainers).toHaveLength(1)
  })

  it('RESOLVE_FAILED appends the failure to every file without advancing', () => {
    const state = makeState({ files: [makeFile(), makeFile({ filename: 'b.csv' })] })
    const next = scanMoveReducer(state, { type: 'RESOLVE_FAILED', message: 'boom' })
    expect(next.step).toBe('upload')
    for (const file of next.files) {
      expect(file.validationErrors).toEqual([{ row: 0, error: 'boom' }])
    }
  })

  it('MOVE_COMPLETED stores the result and lands on execute', () => {
    const state = makeState({ step: 'resolve', files: [makeFile()] })
    const next = scanMoveReducer(state, {
      type: 'MOVE_COMPLETED',
      result: { success: false, moved: 2, errors: [{ row: 1, error: 'occupied' }] },
    })
    expect(next.step).toBe('execute')
    expect(next.moveResult?.moved).toBe(2)
  })

  it('WORKFLOW_RESET returns to the initial state', () => {
    const state = makeState({
      step: 'execute',
      files: [makeFile()],
      createDestinationsStepUsed: true,
      moveResult: { success: true, moved: 1 },
    })
    expect(scanMoveReducer(state, { type: 'WORKFLOW_RESET' })).toEqual(initialScanMoveState())
  })
})

describe('planNextFromUpload', () => {
  const plates = [{ id: 1, name: 'PLATE-A' }]

  it('demands a destination selection per file', () => {
    const state = makeState({ files: [makeFile(), makeFile({ selectedDestinationName: 'PLATE-A' })] })
    const plan = planNextFromUpload(state, plates, micronixScanMoveVariant)
    expect(plan.kind).toBe('missing_destination_selection')
    if (plan.kind !== 'missing_destination_selection') throw new Error('unreachable')
    expect(plan.events).toEqual([
      {
        type: 'FILE_ERRORS_ADDED',
        errorsByFile: [
          {
            fileIndex: 0,
            errors: [
              { row: 0, error: 'Destination plate must be selected for this file', kind: 'destination' },
            ],
          },
        ],
      },
    ])
  })

  it('stays on upload while any file has errors', () => {
    const state = makeState({
      files: [
        makeFile({
          selectedDestinationName: 'PLATE-A',
          validationErrors: [{ row: 1, error: 'bad row' }],
        }),
      ],
    })
    expect(planNextFromUpload(state, plates, micronixScanMoveVariant).kind).toBe('has_errors')
  })

  it('routes through create-destinations when the variant supports it and a destination is new', () => {
    const state = makeState({ files: [makeFile({ selectedDestinationName: 'PLATE-NEW' })] })
    const plan = planNextFromUpload(state, plates, micronixScanMoveVariant)
    expect(plan.kind).toBe('create_destinations')
    if (plan.kind !== 'create_destinations') throw new Error('unreachable')
    expect(plan.events[0]).toMatchObject({
      type: 'CREATE_DESTINATIONS_ENTERED',
      pending: [{ name: 'PLATE-NEW', locationId: null, barcode: '', status: 'pending' }],
    })
  })

  it('routes cryovial through create-destinations for a new box name', () => {
    const state = makeState({ files: [makeFile({ selectedDestinationName: 'BOX-NEW' })] })
    const plan = planNextFromUpload(state, [], cryovialScanMoveVariant)
    expect(plan.kind).toBe('create_destinations')
    if (plan.kind !== 'create_destinations') throw new Error('unreachable')
    expect(plan.events[0]).toMatchObject({
      type: 'CREATE_DESTINATIONS_ENTERED',
      pending: [{ name: 'BOX-NEW', locationId: null, barcode: '', status: 'pending' }],
    })
  })

  it('resolves when all destinations exist and files are clean', () => {
    const state = makeState({ files: [makeFile({ selectedDestinationName: 'PLATE-A' })] })
    expect(planNextFromUpload(state, plates, micronixScanMoveVariant).kind).toBe('resolve')
  })
})
