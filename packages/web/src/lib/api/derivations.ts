import type { EnrichedContainerWire, SpecimenSummaryWire } from '@sampledb/contract/wire'
import { api } from './client'
import type { CreateDerivationRequestPayload } from '../derivation-payload'
import {
  parseContainerSource,
  parseCreateDerivation,
  parseDerivationChain,
  type ParsedContainerSource,
} from './parse-response'
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

export type CreateDerivationPayload = CreateDerivationRequestPayload

export interface CreateDerivationResponse {
  derivation: Derivation
  parentContainer: EnrichedContainerWire
  childContainer: EnrichedContainerWire
  specimen: SpecimenSummaryWire | null
  warnings: string[]
}

export type ContainerSourceResponse = ParsedContainerSource

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
  createFromContainer: async (
    parentContainerId: number,
    payload: CreateDerivationPayload,
  ): Promise<CreateDerivationResponse> => {
    const body = await api.post<unknown>(`/derivations/containers/${parentContainerId}/derive`, payload)
    return parseCreateDerivation(body)
  },
  listFromContainer: (containerId: number, params?: { derivation_type?: string }) =>
    api.get<{ derivations: Derivation[]; count: number }>(`/derivations/containers/${containerId}/derivations`, {
      params,
    }),
  getSource: async (containerId: number): Promise<ContainerSourceResponse> => {
    // Containers that were not derived get { type: 'original', source, container, specimen }.
    const body = await api.get<unknown>(`/derivations/containers/${containerId}/source`)
    return parseContainerSource(body)
  },
  getChain: async (containerId: number): Promise<{
    ancestors: Array<{ container: EnrichedContainerWire | null; derivation: Derivation }>
    descendants: Array<{ container: EnrichedContainerWire | null; derivation: Derivation }>
    current: EnrichedContainerWire | null
  }> => {
    const body = await api.get<unknown>(`/derivations/containers/${containerId}/derivation-chain`)
    return parseDerivationChain(body)
  },
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
