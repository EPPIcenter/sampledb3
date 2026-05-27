import { api } from './client'
import {
  parseContainerDetailWire,
  parseContainersList,
  type ParsedContainerDetailWire,
} from './parse-response'
import type { Unit } from './types'

export type ContainerCollectionInfo = {
  type: string
  id: number
  name: string
  position?: string
  barcode?: string
  label?: string
}

export type ContainerSpecimenSummary = {
  id: number
  studySubjectId?: number | null
  controlBatchId?: number | null
  specimenTypeId: number
  collectionDate?: string | null
  created: string
  lastUpdated: string
  specimenType?: { id: number; name: string } | null
}

export type ContainerSourceInfo =
  | {
      type: 'subject'
      id: number
      name: string
      study: { id: number; title: string; code: string }
    }
  | {
      type: 'control'
      id: number
      name: string
      productionDate?: string | null
      definition: { id: number; name: string }
    }

export type EnrichedContainer = {
  id: number
  specimenId: number
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well' | 'unknown'
  comment?: string | null
  remainingQuantity?: number | null
  totalQuantity?: number | null
  unitId?: number | null
  unit?: Unit
  tags?: Array<{ id: number; name: string }>
  location?: { id: number; name: string; path?: string } | null
  locationPath?: string
  collection?: ContainerCollectionInfo | null
  created?: string
  lastUpdated?: string
}

/** Stable container detail shape for GET /containers/:id (normalized on the client). */
export type ContainerDetail = {
  container: EnrichedContainer
  specimen: ContainerSpecimenSummary | null
  source: ContainerSourceInfo | null
}

/** Legacy wire body: nested fields plus duplicated enriched keys at the top level. */
type ContainerDetailWire = Partial<ContainerDetail> &
  Partial<EnrichedContainer> & {
    container?: EnrichedContainer
  }

export function normalizeContainerDetail(body: ContainerDetailWire | ParsedContainerDetailWire): ContainerDetail {
  const container = body.container ?? (body.id != null ? (body as EnrichedContainer) : undefined)
  if (!container?.id) {
    throw new Error('Invalid container detail response: missing container')
  }
  return {
    container: container as EnrichedContainer,
    specimen: (body.specimen as ContainerSpecimenSummary | null) ?? null,
    source: (body.source as ContainerSourceInfo | null) ?? null,
  }
}

export type ContainersListParams = {
  specimen_id?: number | string
  location_id?: string
  tag_ids?: string[]
  page?: number
  limit?: number
}

export const containersApi = {
  list: async (params?: ContainersListParams) => {
    const body = await api.get<unknown>('/containers', { params })
    return parseContainersList(body)
  },

  get: async (id: number): Promise<ContainerDetail> => {
    const body = await api.get<unknown>(`/containers/${id}`)
    return normalizeContainerDetail(parseContainerDetailWire(body))
  },
}
