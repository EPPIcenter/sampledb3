import type {
  BulkCombinedRequest,
  BulkCombinedValidateRequest,
  BulkCombinedValidateResponse,
  BulkCombinedImportResponse,
} from '@sampledb/contract'
import { api } from './client'
import type { StudySubject, Specimen } from './types'

export type BulkCombinedAtomicMode = BulkCombinedRequest['atomicMode']

export const importsApi = {
  bulkCombined: (data: BulkCombinedRequest) =>
    api.post<
      BulkCombinedImportResponse & {
        results: Array<{
          subject: StudySubject
          subjectCreated: boolean
          specimens: Array<{ specimen: Specimen; containerCreated: boolean; containerId?: number }>
        }>
      }
    >('/imports/bulk-combined', data),
  bulkCombinedValidate: (data: BulkCombinedValidateRequest) =>
    api.post<BulkCombinedValidateResponse>('/imports/bulk-combined/validate', data),
}
