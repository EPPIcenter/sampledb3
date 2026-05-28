import type { BulkCombinedRequest, BulkCombinedValidateRequest } from '@sampledb/contract'
import { api } from './client'
import type { StudySubject, Specimen } from './types'

export type BulkCombinedAtomicMode = BulkCombinedRequest['atomicMode']

export const importsApi = {
  bulkCombined: (data: BulkCombinedRequest) =>
    api.post<{
      summary: { subjectsCreated: number; subjectsUpdated: number; specimensCreated: number; containersCreated: number }
      results: Array<{
        subject: StudySubject
        subjectCreated: boolean
        specimens: Array<{ specimen: Specimen; containerCreated: boolean; containerId?: number }>
      }>
      errors?: Array<{ index: number; error: string }>
    }>('/imports/bulk-combined', data),
  bulkCombinedValidate: (data: BulkCombinedValidateRequest) =>
    api.post<{
      valid: boolean
      errors: Array<{ subjectIndex: number; specimenIndex?: number; rowIndex?: number; message: string }>
    }>('/imports/bulk-combined/validate', data),
}
