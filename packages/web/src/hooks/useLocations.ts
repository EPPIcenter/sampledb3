import { useQuery } from '@tanstack/react-query'
import { locationsApi } from '../lib/api/locations'
import type { Location } from '../lib/api/types'
import { getLocationAncestors } from '../lib/location-tree'

export type LocationTreeNode = Location

export const locationKeys = {
  all: ['locations'] as const,
  list: () => [...locationKeys.all, 'list'] as const,
  detail: (id: number) => [...locationKeys.all, 'detail', id] as const,
}

export function useLocationsList() {
  return useQuery({
    queryKey: locationKeys.list(),
    queryFn: async () => {
      const response = await locationsApi.list()
      return response.locations as Location[]
    },
  })
}

export function useLocationDetail(locationId: number | null) {
  return useQuery({
    queryKey: locationKeys.detail(locationId ?? 0),
    queryFn: () => locationsApi.get(locationId!),
    enabled: locationId != null && Number.isFinite(locationId) && locationId > 0,
  })
}

export type LocationDetailPageParams = {
  plates_page?: number
  plates_limit?: number
  cryovial_boxes_page?: number
  cryovial_boxes_limit?: number
  boxes_page?: number
  boxes_limit?: number
  bags_page?: number
  bags_limit?: number
}

/** Apply list fetch results to tree UI state (selection + expanded ancestors). */
export function applyLocationsTreeState(
  allLocations: Location[],
  preserveState: boolean,
  setters: {
    setLocations: (locations: Location[]) => void
    setExpandedIds: (update: (prev: Set<number>) => Set<number>) => void
    setSelectedNode: (update: (prev: { locationId: number } | null) => { locationId: number } | null) => void
  }
) {
  const { setLocations, setExpandedIds, setSelectedNode } = setters
  setLocations(allLocations)

  if (preserveState) {
    setExpandedIds((prevExpandedIds) => {
      const preservedExpandedIds = new Set<number>()
      prevExpandedIds.forEach((id) => {
        if (allLocations.find((l) => l.id === id)) {
          preservedExpandedIds.add(id)
        }
      })
      return preservedExpandedIds
    })

    setSelectedNode((prevSelectedNode) => {
      if (prevSelectedNode) {
        const selectedLocation = allLocations.find((l) => l.id === prevSelectedNode.locationId)
        if (selectedLocation) {
          const ancestors = getLocationAncestors(allLocations, prevSelectedNode.locationId)
          setExpandedIds((prev) => {
            const next = new Set(prev)
            ancestors.forEach((a) => next.add(a.id))
            return next
          })
          return prevSelectedNode
        }
        if (allLocations.length > 0) {
          const first = allLocations[0]
          const ancestors = getLocationAncestors(allLocations, first.id)
          setExpandedIds(() => new Set(ancestors.map((a) => a.id)))
          return { locationId: first.id }
        }
        return null
      }
      return prevSelectedNode
    })
  } else if (allLocations.length > 0) {
    const first = allLocations[0]
    const ancestors = getLocationAncestors(allLocations, first.id)
    setExpandedIds(() => new Set(ancestors.map((a) => a.id)))
    setSelectedNode(() => ({ locationId: first.id }))
  }
}

export function useLocationDetailPage(locationId: number, pageParams: LocationDetailPageParams) {
  return useQuery({
    queryKey: [...locationKeys.detail(locationId), 'page', pageParams] as const,
    queryFn: async () => {
      const [detailResponse, listResponse] = await Promise.all([
        locationsApi.get(locationId, pageParams),
        locationsApi.list(),
      ])
      return {
        location: detailResponse.location,
        contents: detailResponse.contents,
        hierarchyStats: detailResponse.hierarchyStats,
        pagination: detailResponse.pagination,
        allLocations: listResponse.locations,
      }
    },
    enabled: Number.isFinite(locationId) && locationId > 0,
  })
}
