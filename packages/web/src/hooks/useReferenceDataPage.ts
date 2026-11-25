import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { specimenTypesApi } from '../lib/api/reference-data'
import type { ReferenceDataType } from '../config/reference-data-config'
import { getReferenceDataConfig } from '../config/reference-data-config'

export const referenceDataPageKeys = {
  all: ['reference-data-page'] as const,
  tab: (tab: ReferenceDataType) => [...referenceDataPageKeys.all, tab] as const,
  containerTypes: (specimenTypeId: number) =>
    [...referenceDataPageKeys.all, 'container-types', specimenTypeId] as const,
}

async function loadTabData(tab: ReferenceDataType): Promise<unknown[]> {
  const config = getReferenceDataConfig(tab)
  if (!config) return []

  const res = await config.list()
  // Typed loosely on purpose: callers pass unvalidated response bodies.
  const data: unknown = res.data
  if (Array.isArray(data)) return data
  if (typeof data === 'object' && data !== null) {
    return ((data as Record<string, unknown>)[config.getDataKey()] as unknown[] | undefined) ?? []
  }
  return []
}

export function useReferenceDataTab(activeTab: ReferenceDataType) {
  return useQuery({
    queryKey: referenceDataPageKeys.tab(activeTab),
    queryFn: () => loadTabData(activeTab),
  })
}

/** Per–specimen-type container type assignments (specimen-types tab). */
export function useSpecimenTypeContainerTypes(specimenTypeIds: number[], enabled: boolean) {
  const queries = useQueries({
    queries: specimenTypeIds.map((id) => ({
      queryKey: referenceDataPageKeys.containerTypes(id),
      queryFn: () => specimenTypesApi.getContainerTypes(id),
      enabled: enabled && id > 0,
    })),
  })

  return useMemo(() => {
    const relationships: Record<number, string[]> = {}
    const usageInfo: Record<number, Record<string, boolean>> = {}
    for (let i = 0; i < specimenTypeIds.length; i++) {
      const id = specimenTypeIds[i]
      const result = queries[i]?.data
      if (result) {
        relationships[id] = result.containerTypes
        usageInfo[id] = result.usageInfo ?? {}
      }
    }
    const isPending = enabled && queries.some((q) => q.isPending)
    const isFetching = enabled && queries.some((q) => q.isFetching)
    return {
      relationships,
      usageInfo,
      isPending,
      isFetching,
      refetch: () => Promise.all(queries.map((q) => q.refetch())),
    }
  }, [specimenTypeIds, enabled, queries])
}
