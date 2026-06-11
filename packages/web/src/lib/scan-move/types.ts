/**
 * Scan move workflow core (ADR 0008).
 *
 * Framework-free state machine for CSV-driven bulk container relocation
 * ("Scan move" in CONTEXT.md). Pure reducer + async effects that return
 * events; React integration lives in the hook, not here.
 */
import type { ScannerConfiguration } from '../api/settings'
import type { PlateCandidate } from '../plate-filename-match'
import type {
  ContainerMoveAtomicMode,
  ContainerMoveContainerInfo,
  ContainerMoveCsvRow,
  ContainerMoveCsvStep,
} from '../container-move-csv-types'
import type { PendingDestinationPlate } from '../micronix-move-destination-plates'

export type ScanMoveStep = ContainerMoveCsvStep
export type ScanMoveAtomicMode = ContainerMoveAtomicMode
export type ScanMoveCsvRow = ContainerMoveCsvRow
export type ScanMoveContainerInfo = ContainerMoveContainerInfo
export type PendingDestination = PendingDestinationPlate

export interface ScanMoveValidationError {
  row: number
  error: string
  /**
   * Structural tag so consumers can act on error provenance instead of
   * matching message text: the reducer drops stale 'destination' errors on
   * re-selection, and plate scan validation surfaces only 'inference' errors
   * (format rules like the full-plate check don't apply there).
   */
  kind?: 'relocation' | 'destination' | 'inference'
}

export type ScanMoveIdentifier =
  | { type: 'barcode'; barcode: string }
  | { type: 'position'; sourceCollectionName: string; sourcePosition: string }

export interface ScanMoveResolvedContainer {
  identifierKey: string
  container: ScanMoveContainerInfo
}

export interface ScanMoveUnresolvedContainer {
  identifierKey: string
  /** 1-based CSV data row for display. */
  rowIndex: number
  targetPosition: string
}

/** Structural stand-in for the DOM File so tests can pass plain objects. */
export interface ScanMoveFileSource {
  name: string
  text(): Promise<string>
}

export interface ScanMoveFile {
  file: ScanMoveFileSource
  filename: string
  csvRows: ScanMoveCsvRow[]
  preview: ScanMoveCsvRow[]
  inferredDestinationName: string | null
  inferredMatches: PlateCandidate[]
  selectedDestinationName: string | null
  resolvedContainers: ScanMoveResolvedContainer[]
  unresolvedContainers: ScanMoveUnresolvedContainer[]
  validationErrors: ScanMoveValidationError[]
  isResolved: boolean
}

export interface ScanMovePerFileResult {
  filename: string
  destinationName: string
  moved: number
  errors?: ScanMoveValidationError[]
}

export interface ScanMoveResult {
  success: boolean
  moved: number
  errors?: ScanMoveValidationError[]
  fileResults?: ScanMovePerFileResult[]
}

export interface ScanMoveState {
  step: ScanMoveStep
  files: ScanMoveFile[]
  pendingDestinations: PendingDestination[]
  /** Once true, the create-destinations step stays in the step indicator. */
  createDestinationsStepUsed: boolean
  atomicMode: ScanMoveAtomicMode
  moveResult: ScanMoveResult | null
}

export interface ScanMoveFileErrors {
  fileIndex: number
  errors: ScanMoveValidationError[]
}

export interface ScanMoveResolveOutcome {
  fileIndex: number
  resolvedContainers: ScanMoveResolvedContainer[]
  unresolvedContainers: ScanMoveUnresolvedContainer[]
  errors: ScanMoveValidationError[]
}

export type ScanMoveEvent =
  | { type: 'FILES_INGESTED'; files: ScanMoveFile[] }
  | { type: 'FILE_REMOVED'; fileIndex: number }
  | { type: 'DESTINATION_SELECTED'; fileIndex: number; name: string | null }
  | { type: 'ATOMIC_MODE_SET'; mode: ScanMoveAtomicMode }
  | { type: 'FILE_ERRORS_ADDED'; errorsByFile: ScanMoveFileErrors[] }
  | { type: 'STEP_SET'; step: ScanMoveStep }
  | { type: 'CREATE_DESTINATIONS_ENTERED'; pending: PendingDestination[] }
  | { type: 'PENDING_DESTINATION_UPDATED'; index: number; patch: Partial<PendingDestination> }
  | { type: 'PENDING_DESTINATIONS_SET'; pending: PendingDestination[] }
  | { type: 'RESOLVE_COMPLETED'; outcomes: ScanMoveResolveOutcome[]; advanced: boolean }
  | { type: 'RESOLVE_FAILED'; message: string }
  | { type: 'MOVE_COMPLETED'; result: ScanMoveResult }
  | { type: 'WORKFLOW_RESET' }

/** CSV format behind a variant: lab-configurable scanner config, or fixed code-level spec. */
export type ScanMoveCsvSpec =
  | { kind: 'scanner'; config: ScannerConfiguration }
  | { kind: 'builtin'; requiredColumns: string[]; skipRows: number }

export interface ScanMoveCollectionRef {
  id: number
  name: string
}

export interface ScanMoveIngestContext {
  collections: ScanMoveCollectionRef[]
  scannerConfig?: ScannerConfiguration
}

export interface ScanMoveInference {
  inferredDestinationName: string | null
  inferredMatches: PlateCandidate[]
  selectedDestinationName: string | null
  inferenceErrors: ScanMoveValidationError[]
}

export interface ScanMoveVariantCapabilities {
  /** Missing destination collections can be created mid-workflow (micronix). */
  createDestinations: boolean
  /** Empty positions in the upload must not orphan tubes currently there (micronix). */
  relocationValidation: boolean
}

export interface ScanMoveVariant {
  id: 'micronix' | 'cryovial'
  collectionType: 'micronix_plate' | 'cryovial_box'
  /** Lab-facing noun for error copy: "plate" / "box". */
  destinationNoun: string
  wrongCollectionTypeError: string
  capabilities: ScanMoveVariantCapabilities
  /** Parse + format-validate one file's text. */
  parseAndValidate(
    text: string,
    ctx: ScanMoveIngestContext,
  ): { csvRows: ScanMoveCsvRow[]; errors: ScanMoveValidationError[] }
  inferDestination(
    filename: string,
    csvRows: ScanMoveCsvRow[],
    ctx: ScanMoveIngestContext,
  ): ScanMoveInference
  /** Identifier for a row; null = row does not move (empty well). */
  identifierFromRow(row: ScanMoveCsvRow): ScanMoveIdentifier | null
  identifierKey(identifier: ScanMoveIdentifier): string
  /** Resolve responses echo identifiers as strings or objects; normalize to the same key. */
  identifierKeyFromResponse(identifier: unknown): string | null
}

export interface ScanMoveResolveResponseEntry {
  identifier: unknown
  container: ScanMoveContainerInfo | null
}

/**
 * Port to the collections API. Effects depend on this interface so tests
 * can pass plain stubs (no module mocks).
 */
export interface ScanMoveGateway {
  resolveContainers(
    identifiers: ScanMoveIdentifier[],
  ): Promise<{ containers: ScanMoveResolveResponseEntry[] }>
  moveContainers(request: {
    collectionType: 'micronix_plate' | 'cryovial_box'
    atomicMode: ScanMoveAtomicMode
    mappings: Array<{ fromCollectionName: string; toCollectionName: string }>
    moves: Array<{ identifier: ScanMoveIdentifier; targetPosition: string }>
  }): Promise<{ success: boolean; moved: number; errors?: Array<{ row: number; error: string }> }>
  getDestinationWells(
    collectionId: number,
  ): Promise<Record<string, { type: string; barcode?: string | null }>>
  createDestination(input: { name: string; locationId: number; barcode?: string }): Promise<void>
}
