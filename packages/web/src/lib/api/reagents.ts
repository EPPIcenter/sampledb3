import { api } from './client'

interface ReagentProperties {
  [key: string]: unknown
}

export interface Reagent {
  id: number
  name: string
  reagentType: 'antibody' | 'primer' | 'probe' | 'enzyme' | 'buffer'
  vendor?: string
  catalogNumber?: string
  lotNumber?: string
  receivedDate?: string
  expirationDate?: string
  storageTemp?: string
  properties?: ReagentProperties
  created: string
  lastUpdated: string
}
export const reagentsApi = {
  list: (params?: { type?: string; expiring_within_days?: number }) =>
    api.get<{ reagents: Reagent[] }>('/reagents', { params }),
  get: (id: number) => api.get<{ reagent: Reagent }>(`/reagents/${id}`),
  create: (data: Omit<Reagent, 'id' | 'created' | 'lastUpdated'>) => api.post<{ reagent: Reagent }>('/reagents', data),
  update: (id: number, data: Partial<Reagent>) => api.patch<{ reagent: Reagent }>(`/reagents/${id}`, data),
}

