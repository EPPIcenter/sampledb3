import type { ContainerWriteInput } from '@sampledb/contract'
import { api } from './client'
import type { Specimen } from './types'

type BulkSpecimenContainerWriteInput = ContainerWriteInput & {
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
  comment?: string
}

type SpecimensListResponse = { specimens: Specimen[]; pagination?: { total: number } }
type SpecimenResponse = { specimen: Specimen }
type SpecimensBulkResponse = {
  specimens: Specimen[]
  created: number
  containersCreated?: number
  errors?: Array<{ index: number; error: string }>
}

type CreateSpecimenData = {
  sourceType: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
  sourceId?: number
  studyShortCode?: string
  subjectName?: string
  specimenTypeId?: number
  specimenTypeName?: string
  collectionDate?: string
  container?: BulkSpecimenContainerWriteInput
}

type CreateSpecimensBulkData = {
  specimens: Array<{
    sourceType: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
    sourceId?: number
    studyShortCode?: string
    subjectName?: string
    specimenTypeName: string
    collectionDate?: string
    container: BulkSpecimenContainerWriteInput
  }>
}

/** Payload for adding a container to an existing specimen (POST /specimens/:id/containers). */
export type AddContainerData = BulkSpecimenContainerWriteInput

export type SpecimenListParams = {
  study?: string
  source_type?: string
  specimen_type_id?: string
  collection_date_from?: string
  collection_date_to?: string
  created_from?: string
  created_to?: string
  search?: string
  barcode?: string
  subject_id?: string
  page?: number
  limit?: number
}

export const specimensApi = {
  search: (params?: SpecimenListParams) => api.get<SpecimensListResponse>('/specimens', { params }),
  get: (id: number) => api.get<SpecimenResponse>(`/specimens/${id}`),
  create: (data: CreateSpecimenData) => api.post<SpecimenResponse>('/specimens', data),
  createBulk: (data: CreateSpecimensBulkData) => api.post<SpecimensBulkResponse>('/specimens/bulk', data),
  validateBulk: (data: CreateSpecimensBulkData) =>
    api.post<{ valid: boolean; errors: Array<{ index: number; message: string }> }>(
      '/specimens/bulk/validate',
      data
    ),
  addContainer: (specimenId: number, data: AddContainerData) =>
    api.post<{ containerId: number }>(`/specimens/${specimenId}/containers`, data),
}
