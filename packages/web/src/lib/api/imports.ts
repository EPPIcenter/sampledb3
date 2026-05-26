import { api } from './client'
import type { StudySubject, Specimen } from './types'

export type BulkCombinedAtomicMode = 'full_file' | 'per_subject'

export const importsApi = {
  bulkCombined: (data: {
    studyShortCode: string
    atomicMode: BulkCombinedAtomicMode
    createCollections?: Array<{
      type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
      name: string
      locationId: number
      barcode?: string
    }>
    subjects: Array<{
      subjectName: string
      specimens: Array<{
        specimenTypeName: string
        collectionDate?: string
        container?: {
          containerType?: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
          collectionName?: string
          collectionBarcode?: string
          barcode?: string
          position?: string
          label?: string
          unitId?: number
          totalQuantity?: number
          remainingQuantity?: number
          comment?: string
          collectionLocationId?: number
        }
      }>
    }>
  }) =>
    api.post<{
      summary: { subjectsCreated: number; subjectsUpdated: number; specimensCreated: number; containersCreated: number }
      results: Array<{
        subject: StudySubject
        subjectCreated: boolean
        specimens: Array<{ specimen: Specimen; containerCreated: boolean; containerId?: number }>
      }>
      errors?: Array<{ index: number; error: string }>
    }>('/imports/bulk-combined', data),
  bulkCombinedValidate: (data: {
    studyShortCode: string
    atomicMode: BulkCombinedAtomicMode
    createCollections?: Array<{
      type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
      name: string
      locationId: number
      barcode?: string
    }>
    subjects: Array<{
      subjectName: string
      specimens: Array<{
        specimenTypeName: string
        collectionDate?: string
        container?: {
          containerType?: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
          collectionName?: string
          collectionBarcode?: string
          barcode?: string
          position?: string
          label?: string
          unitId?: number
          totalQuantity?: number
          remainingQuantity?: number
          comment?: string
          collectionLocationId?: number
        }
        rowIndex?: number
      }>
    }>
  }) =>
    api.post<{
      valid: boolean
      errors: Array<{ subjectIndex: number; specimenIndex?: number; rowIndex?: number; message: string }>
    }>('/imports/bulk-combined/validate', data),
}

