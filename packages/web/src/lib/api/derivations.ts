import type { EnrichedContainerWire } from '@sampledb/contract/wire'
import { api } from './client'
import type { Specimen } from './types'
interface DerivationProperties {
  [key: string]: unknown
}

export interface Derivation {
  id: number
  parentContainerId: number
  childContainerId: number
  derivationType: string
  derivationDate?: string
  protocol?: string
  notes?: string
  properties?: DerivationProperties | null
}

export interface CreateDerivationPayload {
  derivationType: string
  specimenTypeName: string
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
  quantity?: number
  unitSymbol?: string
  quantityUsed?: number
  reduceParentQuantity?: boolean
  derivationDate?: string
  protocol?: string
  notes?: string
  properties?: DerivationProperties
  collectionId?: number
   collectionName?: string
   collectionType?: 'micronix_plate' | 'cryovial_box' | 'sheet'
   collectionLocationId?: number
  sheetParentType?: 'box' | 'bag'
  sheetParentName?: string
  containerBarcode?: string
  sublabel?: string
  position?: string
  operatorId?: number
}

export interface CreateDerivationResponse {
  derivation: Derivation
  parentContainer: any
  childContainer: any
  specimen: Specimen
  warnings: string[]
}

export interface DerivationCsvImportResultRow {
  index: number
  success: boolean
  error?: string
  warnings?: string[]
  derivationId?: number
  parentContainerId?: number
  childContainerId?: number
  collectionStatus?: 'existing' | 'will_be_created'
  /** User-facing: derivation type name */
  derivationTypeName?: string
  /** User-facing: parent container/source (e.g. barcode, box · position) */
  parentSummary?: string
  /** User-facing: child placement (e.g. collection · position) */
  childSummary?: string
}

export interface BulkDerivationSettings {
  derivationType: string
  specimenTypeName: string
  /** Empty string means "provide this column in the CSV (per row)" */
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | ''
  protocol: string
  derivationDate: string
  quantity?: number
  unitSymbol?: string
  quantityUsed?: number
  reduceParentQuantity?: boolean
  validateSourceSpecimenType?: boolean
  validateParentQuantity?: boolean
}

export interface CollectionStatus {
  name?: string
  barcode?: string
  status: 'existing' | 'will_be_created'
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper'
}

export interface ValidationResult {
  rows: Array<{
    index: number
    valid: boolean
    error?: string
    warnings?: string[]
    parentContainerId?: number
    collectionStatus?: 'existing' | 'will_be_created'
  }>
  collections: CollectionStatus[]
  summary: {
    total: number
    valid: number
    invalid: number
    warnings: number
  }
}

export const derivationsApi = {
  createFromContainer: (parentContainerId: number, payload: CreateDerivationPayload) =>
    api.post<CreateDerivationResponse>(`/derivations/containers/${parentContainerId}/derive`, payload),
  listFromContainer: (containerId: number, params?: { derivation_type?: string }) =>
    api.get<{ derivations: Derivation[]; count: number }>(`/derivations/containers/${containerId}/derivations`, {
      params,
    }),
  getSource: (containerId: number) =>
    api.get<{
      derivation: Derivation
      parentContainer: any
      parentSpecimen: Specimen
    }>(`/derivations/containers/${containerId}/source`),
  getChain: (containerId: number) =>
    api.get<{
      ancestors: Array<{ container: EnrichedContainerWire | null; derivation: Derivation }>
      descendants: Array<{ container: EnrichedContainerWire | null; derivation: Derivation }>
      current: EnrichedContainerWire | null
    }>(`/derivations/containers/${containerId}/derivation-chain`),
  update: (id: number, patch: Partial<Pick<Derivation, 'derivationDate' | 'protocol' | 'notes' | 'properties'>>) =>
    api.patch<{ derivation: Derivation }>(`/derivations/derivations/${id}`, patch),
  delete: (id: number) =>
    api.delete<{ message: string }>(`/derivations/derivations/${id}`),
  importCsv: (csv: string, options?: { dryRun?: boolean; settings?: BulkDerivationSettings }) =>
    api.post<{ rows: DerivationCsvImportResultRow[] }>('/imports/derivations-csv', {
      csv,
      dryRun: options?.dryRun,
      settings: options?.settings,
    }),
  validateCsv: (csv: string, settings?: BulkDerivationSettings) =>
    api.post<ValidationResult>('/imports/derivations-csv/validate', {
      csv,
      settings,
    }),
}
