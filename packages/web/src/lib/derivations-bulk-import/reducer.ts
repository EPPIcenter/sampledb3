import { deriveMissingCollections, mergeMissingCollections } from './collections'
import { csvForImport } from './csv'
import type { DerivationsBulkEvent, DerivationsBulkState, MissingDerivationCollection } from './types'

export function initialDerivationsBulkState(): DerivationsBulkState {
  return {
    step: 'upload',
    csvContent: '',
    reviewHeaders: [],
    reviewRows: [],
    reviewFileRows: [],
    validationResult: null,
    importResults: null,
    error: null,
    collectionUpdates: {},
  }
}

function guarded(state: DerivationsBulkState): DerivationsBulkState {
  if (!state.csvContent && state.step !== 'upload') {
    return { ...state, step: 'upload' }
  }
  return state
}

export function derivationsBulkReducer(
  state: DerivationsBulkState,
  event: DerivationsBulkEvent,
): DerivationsBulkState {
  switch (event.type) {
    case 'FILE_LOADED':
      return guarded({
        ...state,
        csvContent: event.csvContent,
        validationResult: null,
        importResults: null,
        reviewHeaders: [],
        reviewRows: [],
        reviewFileRows: [],
        collectionUpdates: {},
        error: null,
        step: 'upload',
      })

    case 'FILE_CLEARED':
      return initialDerivationsBulkState()

    case 'ERROR':
      return { ...state, error: event.message }

    case 'ERROR_CLEARED':
      return { ...state, error: null }

    case 'VALIDATED':
      return guarded({
        ...state,
        validationResult: event.result,
        reviewHeaders: event.headers,
        reviewRows: event.rows.map((row) => ({ ...row })),
        reviewFileRows: [...event.fileRows],
        collectionUpdates: {},
        error: null,
        importResults: null,
      })

    case 'STEP_SET':
      return guarded({ ...state, step: event.step })

    case 'REVIEW_CELL_SET':
      return {
        ...state,
        reviewRows: state.reviewRows.map((row, i) =>
          i === event.rowIndex ? { ...row, [event.header]: event.value } : row,
        ),
      }

    case 'COLLECTION_PATCHED':
      return {
        ...state,
        collectionUpdates: {
          ...state.collectionUpdates,
          [event.index]: { ...state.collectionUpdates[event.index], ...event.patch },
        },
      }

    case 'IMPORTED':
      return { ...state, importResults: event.rows, error: null }

    default:
      return state
  }
}

export function selectMissingCollections(state: DerivationsBulkState): MissingDerivationCollection[] {
  return mergeMissingCollections(
    deriveMissingCollections(state.validationResult),
    state.collectionUpdates,
  )
}

export function selectCsvForImport(state: DerivationsBulkState): string {
  return csvForImport(state.csvContent, state.reviewHeaders, state.reviewRows)
}

/** The spreadsheet row of the API's row `index`, counting the header as row 1. */
export function selectFileRow(state: DerivationsBulkState, index: number): number {
  return state.reviewFileRows[index] ?? index + 2
}
