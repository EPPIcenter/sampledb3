import type {
  BulkCombinedRequest,
  BulkCombinedValidateRequest,
  BulkCombinedValidateResponse,
  BulkCombinedImportResponse,
} from '@sampledb/contract'
import type { SpecimenSummaryWire } from '@sampledb/contract/wire'
import { api } from './client'
import type { StudySubject } from './types'

export type BulkCombinedAtomicMode = BulkCombinedRequest['atomicMode']

export const importsApi = {
  bulkCombined: (data: BulkCombinedRequest) =>
    api.post<
      BulkCombinedImportResponse & {
        results: Array<{
          subject: StudySubject
          subjectCreated: boolean
          specimens: Array<{ specimen: SpecimenSummaryWire; containerCreated: boolean; containerId?: number }>
        }>
      }
    >('/imports/bulk-combined', data),
  bulkCombinedValidate: (data: BulkCombinedValidateRequest) =>
    api.post<BulkCombinedValidateResponse>('/imports/bulk-combined/validate', data),
}
