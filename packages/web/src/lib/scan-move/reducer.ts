import { buildPendingDestinationPlates, getMissingDestinationPlateNames } from '../micronix-move-destination-plates'
import type {
  ScanMoveCollectionRef,
  ScanMoveEvent,
  ScanMoveFile,
  ScanMoveFileErrors,
  ScanMoveState,
  ScanMoveVariant,
} from './types'

export function initialScanMoveState(): ScanMoveState {
  return {
    step: 'upload',
    files: [],
    pendingDestinations: [],
    createDestinationsStepUsed: false,
    atomicMode: 'all_or_nothing',
    moveResult: null,
  }
}

function clearResolution(file: ScanMoveFile, name: string | null): ScanMoveFile {
  return {
    ...file,
    selectedDestinationName: name,
    resolvedContainers: [],
    unresolvedContainers: [],
    isResolved: false,
    // Errors caused by the previous destination choice no longer apply.
    validationErrors: file.validationErrors.filter((e) => e.kind === undefined),
  }
}

function appendErrors(files: ScanMoveFile[], errorsByFile: ScanMoveFileErrors[]): ScanMoveFile[] {
  if (errorsByFile.length === 0) return files
  const byIndex = new Map(errorsByFile.map((e) => [e.fileIndex, e.errors]))
  return files.map((f, i) => {
    const errors = byIndex.get(i)
    if (!errors || errors.length === 0) return f
    return { ...f, validationErrors: [...f.validationErrors, ...errors] }
  })
}

/** Steps other than upload are meaningless without files. */
function guarded(state: ScanMoveState): ScanMoveState {
  if (state.files.length === 0 && state.step !== 'upload') {
    return { ...state, step: 'upload' }
  }
  return state
}

export function scanMoveReducer(state: ScanMoveState, event: ScanMoveEvent): ScanMoveState {
  switch (event.type) {
    case 'FILES_INGESTED':
      return guarded({
        ...state,
        files: event.files,
        moveResult: null,
        step: 'upload',
      })

    case 'FILE_REMOVED':
      return guarded({
        ...state,
        files: state.files.filter((_, i) => i !== event.fileIndex),
      })

    case 'DESTINATION_SELECTED':
      return {
        ...state,
        files: state.files.map((f, i) => (i === event.fileIndex ? clearResolution(f, event.name) : f)),
      }

    case 'ATOMIC_MODE_SET':
      return { ...state, atomicMode: event.mode }

    case 'FILE_ERRORS_ADDED':
      return { ...state, files: appendErrors(state.files, event.errorsByFile) }

    case 'STEP_SET':
      return guarded({ ...state, step: event.step })

    case 'CREATE_DESTINATIONS_ENTERED':
      return guarded({
        ...state,
        pendingDestinations: event.pending,
        createDestinationsStepUsed: true,
        step: 'create_plates',
      })

    case 'PENDING_DESTINATION_UPDATED':
      return {
        ...state,
        pendingDestinations: state.pendingDestinations.map((p, i) =>
          i === event.index ? { ...p, ...event.patch } : p,
        ),
      }

    case 'PENDING_DESTINATIONS_SET':
      return { ...state, pendingDestinations: event.pending }

    case 'RESOLVE_COMPLETED': {
      const byIndex = new Map(event.outcomes.map((o) => [o.fileIndex, o]))
      const files = state.files.map((f, i) => {
        const outcome = byIndex.get(i)
        if (!outcome) return f
        const base = {
          ...f,
          resolvedContainers: outcome.resolvedContainers,
          unresolvedContainers: outcome.unresolvedContainers,
          isResolved: true,
        }
        if (outcome.errors.length === 0) return base
        return {
          ...base,
          validationErrors: [
            ...f.validationErrors.filter((e) => e.kind !== 'relocation'),
            ...outcome.errors,
          ],
        }
      })
      return guarded({ ...state, files, step: event.advanced ? 'resolve' : state.step })
    }

    case 'RESOLVE_FAILED':
      return {
        ...state,
        files: state.files.map((f) => ({
          ...f,
          validationErrors: [...f.validationErrors, { row: 0, error: event.message }],
        })),
      }

    case 'MOVE_COMPLETED':
      return guarded({ ...state, moveResult: event.result, step: 'execute' })

    case 'WORKFLOW_RESET':
      return initialScanMoveState()
  }
}

export type ScanMoveUploadPlan =
  | { kind: 'missing_destination_selection'; events: ScanMoveEvent[] }
  | { kind: 'has_errors'; events: ScanMoveEvent[] }
  | { kind: 'create_destinations'; events: ScanMoveEvent[] }
  | { kind: 'resolve' }

/**
 * Decide what "Next" does on the upload step. Pure: the hook dispatches the
 * returned events and runs the resolve effect only for `kind: 'resolve'`.
 */
export function planNextFromUpload(
  state: ScanMoveState,
  availableCollections: ScanMoveCollectionRef[],
  variant: ScanMoveVariant,
): ScanMoveUploadPlan {
  const missingSelection: ScanMoveFileErrors[] = []
  state.files.forEach((f, i) => {
    if (f.selectedDestinationName) return
    missingSelection.push({
      fileIndex: i,
      errors: [
        {
          row: 0,
          error: `Destination ${variant.destinationNoun} must be selected for this file`,
          kind: 'destination',
        },
      ],
    })
  })

  if (missingSelection.length > 0) {
    return {
      kind: 'missing_destination_selection',
      events: [{ type: 'FILE_ERRORS_ADDED', errorsByFile: missingSelection }],
    }
  }

  if (state.files.some((f) => f.validationErrors.length > 0)) {
    return { kind: 'has_errors', events: [{ type: 'STEP_SET', step: 'upload' }] }
  }

  if (variant.capabilities.createDestinations) {
    const missing = getMissingDestinationPlateNames(
      state.files.map((f) => f.selectedDestinationName),
      availableCollections,
    )
    if (missing.length > 0) {
      return {
        kind: 'create_destinations',
        events: [
          { type: 'CREATE_DESTINATIONS_ENTERED', pending: buildPendingDestinationPlates(missing) },
        ],
      }
    }
  }

  return { kind: 'resolve' }
}
