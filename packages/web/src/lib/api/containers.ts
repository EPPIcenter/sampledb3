import type { EnrichedContainerWire } from '@sampledb/contract/wire'
import { api } from './client'
import {
  parseContainerDetailWire,
  parseContainersList,
  type ParsedContainerDetailWire,
} from './parse-response'

export type { EnrichedContainerWire as EnrichedContainer }

export type ContainerCollectionInfo = NonNullable<EnrichedContainerWire['collection']>

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

/** Stable container detail shape for GET /containers/:id (normalized on the client). */
export type ContainerDetail = {
  container: EnrichedContainerWire
  specimen: ContainerSpecimenSummary | null
  source: ContainerSourceInfo | null
}

/** Legacy wire body: nested fields plus duplicated enriched keys at the top level. */
type LegacyContainerDetailWire = Partial<ContainerDetail> &
  Partial<EnrichedContainerWire> & {
    container?: EnrichedContainerWire
  }

function containerFromWireBody(
  body: ParsedContainerDetailWire | LegacyContainerDetailWire,
): EnrichedContainerWire | undefined {
  if (body.container?.id != null) {
    return body.container
  }
  if ('id' in body && typeof body.id === 'number') {
    return body as EnrichedContainerWire
  }
  return undefined
}

export function normalizeContainerDetail(
  body: ParsedContainerDetailWire | LegacyContainerDetailWire,
): ContainerDetail {
  const container = containerFromWireBody(body)
  if (!container?.id) {
    throw new Error('Invalid container detail response: missing container')
  }
  return {
    container,
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
