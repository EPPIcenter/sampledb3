import { api } from './client'
import type { ApiResponse } from '../../types/api'
import type { SpecimenType, Location, Unit } from './types'
import { extractData } from './extract-data'
export interface Tag {
  id: number
  name: string
}

export interface StorageType {
  id: number
  name: string
  description?: string
}

export interface Strain {
  id: number
  name: string
  description?: string
}

export const specimenTypesApi = {
  list: async (): Promise<{ data: SpecimenType[]; meta?: ApiResponse<SpecimenType[]>['meta'] }> => {
    const response = await api.get<ApiResponse<SpecimenType[]>>('/specimen-types')
    return { data: extractData(response), meta: response.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<SpecimenType>>(`/specimen-types/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<SpecimenType, 'id' | 'created' | 'lastUpdated'>) => {
    const response = await api.post<ApiResponse<SpecimenType>>('/specimen-types', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<SpecimenType>) => {
    const response = await api.put<ApiResponse<SpecimenType>>(`/specimen-types/${id}`, data)
    return extractData(response)
  },
  delete: (id: number) => api.delete<{ message: string }>(`/specimen-types/${id}`),
  getContainerTypes: (id: number) => api.get<{ containerTypes: string[]; usageInfo?: Record<string, boolean> }>(`/specimen-types/${id}/container-types`),
  addContainerType: (id: number, containerType: string) =>
    api.post<{ success: boolean; containerType: string }>(`/specimen-types/${id}/container-types`, { containerType }),
  removeContainerType: (id: number, containerType: string) =>
    api.delete<{ success: boolean }>(`/specimen-types/${id}/container-types/${containerType}`),
  getByContainerType: (containerType: string) =>
    api.get<{ specimenTypes: SpecimenType[] }>(`/specimen-types/container-types/${containerType}`),
}

// States API removed - replaced with tags
export const tagsApi = {
  list: async (): Promise<{ data: Tag[]; meta?: ApiResponse<Tag[]>['meta'] }> => {
    const response = await api.get<ApiResponse<Tag[]>>('/tags')
    return { data: extractData(response), meta: response.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<Tag>>(`/tags/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<Tag, 'id'>) => {
    const response = await api.post<ApiResponse<Tag>>('/tags', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<Tag>) => {
    const response = await api.put<ApiResponse<Tag>>(`/tags/${id}`, data)
    return extractData(response)
  },
  delete: (id: number) => api.delete<{ message: string }>(`/tags/${id}`),
}

export const storageTypesApi = {
  list: async (): Promise<{ data: StorageType[]; meta?: ApiResponse<StorageType[]>['meta'] }> => {
    const response = await api.get<ApiResponse<StorageType[]>>('/storage-types')
    return { data: extractData(response), meta: response.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<StorageType>>(`/storage-types/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<StorageType, 'id'>) => {
    const response = await api.post<ApiResponse<StorageType>>('/storage-types', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<StorageType>) => {
    const response = await api.put<ApiResponse<StorageType>>(`/storage-types/${id}`, data)
    return extractData(response)
  },
  delete: (id: number) => api.delete<{ message: string }>(`/storage-types/${id}`),
}

export const strainsApi = {
  list: async (): Promise<{ data: Strain[]; meta?: ApiResponse<Strain[]>['meta'] }> => {
    const response = await api.get<ApiResponse<Strain[]>>('/strains')
    return { data: extractData(response), meta: response.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<Strain>>(`/strains/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<Strain, 'id'>) => {
    const response = await api.post<ApiResponse<Strain>>('/strains', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<Strain>) => {
    const response = await api.put<ApiResponse<Strain>>(`/strains/${id}`, data)
    return extractData(response)
  },
  delete: (id: number) => api.delete<{ message: string }>(`/strains/${id}`),
}

export const unitsApi = {
  list: async (): Promise<{ data: Unit[]; meta?: ApiResponse<Unit[]>['meta'] }> => {
    const response = await api.get<ApiResponse<Unit[]>>('/units')
    return { data: extractData(response), meta: response.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<Unit>>(`/units/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<Unit, 'id'>) => {
    const response = await api.post<ApiResponse<Unit>>('/units', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<Unit>) => {
    const response = await api.put<ApiResponse<Unit>>(`/units/${id}`, data)
    return extractData(response)
  },
  delete: (id: number) => api.delete<{ message: string }>(`/units/${id}`),
}


interface CellLineProperties {
  [key: string]: unknown
}

interface PlasmidProperties {
  [key: string]: unknown
}

interface StandardProperties {
  [key: string]: unknown
}

export interface CellLine {
  id: number
  name: string
  species: string
  strain?: string
  source?: string
  properties?: CellLineProperties
  created: string
  lastUpdated: string
}

export interface Plasmid {
  id: number
  name: string
  backbone?: string
  insertName?: string
  insertSizeBp?: number
  resistance?: string
  source?: string
  properties?: PlasmidProperties
  created: string
  lastUpdated: string
}

export interface Standard {
  id: number
  name: string
  standardType: string
  manufacturer?: string
  catalogNumber?: string
  lotNumber?: string
  properties?: StandardProperties
  created: string
  lastUpdated: string
}

export const cellLinesApi = {
  list: () => api.get<{ cellLines: CellLine[] }>('/cell-lines'),
  get: (id: number) => api.get<{ cellLine: CellLine }>(`/cell-lines/${id}`),
}

export const plasmidsApi = {
  list: () => api.get<{ plasmids: Plasmid[] }>('/plasmids'),
  get: (id: number) => api.get<{ plasmid: Plasmid }>(`/plasmids/${id}`),
}

export const standardsApi = {
  list: () => api.get<{ standards: Standard[] }>('/standards'),
  get: (id: number) => api.get<{ standard: Standard }>(`/standards/${id}`),
}
