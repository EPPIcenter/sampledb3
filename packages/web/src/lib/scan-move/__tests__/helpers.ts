import type {
  ScanMoveFile,
  ScanMoveFileSource,
  ScanMoveGateway,
  ScanMoveState,
} from '../types'
import { initialScanMoveState } from '../reducer'

export function fileSource(name: string, text = ''): ScanMoveFileSource {
  return { name, text: () => Promise.resolve(text) }
}

export function makeFile(overrides: Partial<ScanMoveFile> = {}): ScanMoveFile {
  const name = overrides.filename ?? 'scan.csv'
  return {
    file: fileSource(name),
    filename: name,
    csvRows: [],
    preview: [],
    inferredDestinationName: null,
    inferredMatches: [],
    selectedDestinationName: null,
    resolvedContainers: [],
    unresolvedContainers: [],
    validationErrors: [],
    isResolved: false,
    ...overrides,
  }
}

export function makeState(overrides: Partial<ScanMoveState> = {}): ScanMoveState {
  return { ...initialScanMoveState(), ...overrides }
}

export function stubGateway(overrides: Partial<ScanMoveGateway> = {}): ScanMoveGateway {
  return {
    resolveContainers: () => Promise.resolve({ containers: [] }),
    moveContainers: () => Promise.resolve({ success: true, moved: 0 }),
    getDestinationWells: () => Promise.resolve({}),
    createDestination: () => Promise.resolve(),
    ...overrides,
  }
}

export function containerInfo(overrides: Partial<import('../types').ScanMoveContainerInfo> = {}) {
  return {
    containerId: 1,
    containerType: 'micronix_tube',
    currentCollectionId: 10,
    currentCollectionName: 'SOURCE-1',
    currentCollectionType: 'micronix_plate',
    currentPosition: 'A01',
    ...overrides,
  }
}
