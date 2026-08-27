import type {
  BulkDerivationSettings,
  DerivationCsvImportResultRow,
  ValidationResult,
} from '../api/derivations'

export type SourceType = 'control_batch' | 'study_subject'
export type ParentContainerType = 'paper' | 'cryovial_tube' | 'micronix_tube'
export type DerivationsBulkStep = 'upload' | 'collections' | 'review' | 'import'

export interface MissingDerivationCollection {
  name?: string
  barcode?: string
  containerType: 'micronix_tube' | 'cryovial_tube'
  locationId: number | null
  status: 'pending' | 'creating' | 'success' | 'error'
  error?: string
}

export interface DerivationsBulkState {
  step: DerivationsBulkStep
  csvContent: string
  reviewHeaders: string[]
  reviewRows: Record<string, string>[]
  validationResult: ValidationResult | null
  importResults: DerivationCsvImportResultRow[] | null
  error: string | null
  collectionUpdates: Record<number, Partial<MissingDerivationCollection>>
}

export type DerivationsBulkEvent =
  | { type: 'FILE_LOADED'; csvContent: string }
  | { type: 'FILE_CLEARED' }
  | { type: 'ERROR'; message: string }
  | { type: 'ERROR_CLEARED' }
  | { type: 'VALIDATED'; result: ValidationResult; headers: string[]; rows: Record<string, string>[] }
  | { type: 'STEP_SET'; step: DerivationsBulkStep }
  | { type: 'REVIEW_CELL_SET'; rowIndex: number; header: string; value: string }
  | { type: 'COLLECTION_PATCHED'; index: number; patch: Partial<MissingDerivationCollection> }
  | { type: 'IMPORTED'; rows: DerivationCsvImportResultRow[] }

export interface DerivationsBulkGateway {
  validateCsv(csvContent: string, settings: BulkDerivationSettings): Promise<ValidationResult>
  importCsv(csvContent: string, settings: BulkDerivationSettings): Promise<{ rows: DerivationCsvImportResultRow[] }>
  createMicronixPlate(input: { name: string; locationId: number; barcode?: string }): Promise<unknown>
  createCryovialBox(input: { name: string; locationId: number; barcode?: string }): Promise<unknown>
}
