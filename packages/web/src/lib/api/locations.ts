import { api } from './client'
import type { Location } from './types'
export interface LocationHierarchyStats {
  depth: number
  totalDescendants: number
  directContainers: {
    micronix: number
    cryovial: number
    boxes: number
    bags: number
  }
  aggregatedContainers: {
    micronix: number
    cryovial: number
    boxes: number
    bags: number
  }
  childLocationStats: Array<{
    locationId: number
    locationName: string
    canContainCollections: boolean
    containerCounts: {
      micronix: number
      cryovial: number
      boxes: number
      bags: number
    }
  }>
}
export const locationsApi = {
  list: (page?: number, limit?: number, search?: string) => {
    const params: Record<string, string | number> = {}
    if (page) params.page = page
    if (limit) params.limit = limit
    if (search && search.trim()) params.search = search.trim()
    return api.get<{ locations: Location[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }>('/locations', { params })
  },
  get: (id: number, params?: {
    boxes_page?: number;
    boxes_limit?: number;
    plates_page?: number;
    plates_limit?: number;
    cryovial_boxes_page?: number;
    cryovial_boxes_limit?: number;
    bags_page?: number;
    bags_limit?: number;
  }) => {
    const queryParams: Record<string, string | number | undefined> = {}
    if (params?.boxes_page) queryParams.boxes_page = params.boxes_page
    if (params?.boxes_limit) queryParams.boxes_limit = params.boxes_limit
    if (params?.plates_page) queryParams.plates_page = params.plates_page
    if (params?.plates_limit) queryParams.plates_limit = params.plates_limit
    if (params?.cryovial_boxes_page) queryParams.cryovial_boxes_page = params.cryovial_boxes_page
    if (params?.cryovial_boxes_limit) queryParams.cryovial_boxes_limit = params.cryovial_boxes_limit
    if (params?.bags_page) queryParams.bags_page = params.bags_page
    if (params?.bags_limit) queryParams.bags_limit = params.bags_limit
    return api.get<{ location: Location; contents: { micronixPlates?: Array<{ id: number; name: string; barcode?: string | null; locationId: number; itemCount?: number }>; cryovialBoxes?: Array<{ id: number; name: string; barcode?: string | null; locationId: number; itemCount?: number }>; boxes?: Array<{ id: number; name: string; locationId: number; itemCount?: number }>; bags?: Array<{ id: number; name: string; locationId: number; itemCount?: number }> }; pagination?: { micronixPlates?: { page: number; limit: number; total: number; totalPages: number }; cryovialBoxes?: { page: number; limit: number; total: number; totalPages: number }; boxes?: { page: number; limit: number; total: number; totalPages: number }; bags?: { page: number; limit: number; total: number; totalPages: number } }; hierarchyStats?: LocationHierarchyStats }>(`/locations/${id}`, { params: queryParams })
  },
  create: (data: Omit<Location, 'id' | 'created' | 'lastUpdated'>) =>
    api.post<{ location: Location }>('/locations', data),
  update: (id: number, data: Partial<Omit<Location, 'id' | 'created' | 'lastUpdated'>>) =>
    api.put<{ location: Location }>(`/locations/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/locations/${id}`),
}

