import { api } from './client'
import type { Specimen } from './types'

type SpecimensListResponse = { specimens: Specimen[] }
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
  containerBarcode?: string
}

type CreateSpecimensBulkData = {
  specimens: Array<{
    sourceType: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
    sourceId?: number
    studyShortCode?: string
    subjectName?: string
    specimenTypeName: string
    collectionDate?: string
    containerBarcode?: string
    container?: {
      containerType?: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
      collectionName?: string
      collectionBarcode?: string
      barcode?: string
      position?: string
      label?: string
      collectionLocationId?: number
    }
  }>
}

/** Payload for adding a container to an existing specimen (POST /specimens/:id/containers). */
export type AddContainerData = {
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
  collectionName?: string
  collectionBarcode?: string
  barcode?: string
  position?: string
  label?: string
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
  comment?: string
}

export const specimensApi = {
  search: async (params?: { source_type?: string; study?: string; barcode?: string; subject_id?: string }): Promise<SpecimensListResponse> => {
    const response = await api.get<SpecimensListResponse>('/specimens', { params })
    return response.data
  },
  get: async (id: number): Promise<SpecimenResponse> => {
    const response = await api.get<SpecimenResponse>(`/specimens/${id}`)
    return response.data
  },
  create: async (data: CreateSpecimenData): Promise<SpecimenResponse> => {
    const response = await api.post<SpecimenResponse>('/specimens', data)
    return response.data
  },
  createBulk: async (data: CreateSpecimensBulkData): Promise<SpecimensBulkResponse> => {
    const response = await api.post<SpecimensBulkResponse>('/specimens/bulk', data)
    return response.data
  },
  validateBulk: async (data: CreateSpecimensBulkData): Promise<{ valid: boolean; errors: Array<{ index: number; message: string }> }> => {
    const response = await api.post<{ valid: boolean; errors: Array<{ index: number; message: string }> }>('/specimens/bulk/validate', data)
    return response.data
  },
  /** Add a container to an existing specimen. */
  addContainer: async (
    specimenId: number,
    data: AddContainerData
  ): Promise<{ containerId: number }> => {
    const response = await api.post<{ containerId: number }>(
      `/specimens/${specimenId}/containers`,
      data
    )
    return response.data
  },
}
