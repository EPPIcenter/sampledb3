import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collectionsApi } from '../lib/api/collections'
import type { CollectionListItem } from '../lib/collections-browse'
import { invalidateAfterBulkWrite } from '../lib/query-client'

/** A Collection that delete-with-contents can remove. */
export type DeletableCollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'

export const collectionKeys = {
  all: ['collections'] as const,
  listAll: () => [...collectionKeys.all, 'list-all'] as const,
  cryovialBox: (id: number) => [...collectionKeys.all, 'cryovial-box', id] as const,
  micronixPlate: (id: number) => [...collectionKeys.all, 'micronix-plate', id] as const,
  box: (id: number) => [...collectionKeys.all, 'box', id] as const,
  bag: (id: number) => [...collectionKeys.all, 'bag', id] as const,
  sheet: (id: number) => [...collectionKeys.all, 'sheet', id] as const,
  detail: (type: DeletableCollectionType, id: number) => {
    switch (type) {
      case 'micronix_plate':
        return collectionKeys.micronixPlate(id)
      case 'cryovial_box':
        return collectionKeys.cryovialBox(id)
      case 'box':
        return collectionKeys.box(id)
      case 'bag':
        return collectionKeys.bag(id)
    }
  },
  deletePreflight: (type: DeletableCollectionType, id: number) =>
    [...collectionKeys.detail(type, id), 'delete-preflight'] as const,
}

export function useAllCollections() {
  return useQuery({
    queryKey: collectionKeys.listAll(),
    queryFn: async () => {
      const res = await collectionsApi.listAllCollections()
      return res.collections as CollectionListItem[]
    },
  })
}

export function useCryovialBox(id: number) {
  return useQuery({
    queryKey: collectionKeys.cryovialBox(id),
    queryFn: () => collectionsApi.getCryovialBox(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

export function useMicronixPlate(id: number) {
  return useQuery({
    queryKey: collectionKeys.micronixPlate(id),
    queryFn: () => collectionsApi.getMicronixPlate(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

export function useBox(id: number) {
  return useQuery({
    queryKey: collectionKeys.box(id),
    queryFn: () => collectionsApi.getBox(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

export function useBag(id: number) {
  return useQuery({
    queryKey: collectionKeys.bag(id),
    queryFn: () => collectionsApi.getBag(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

export function useSheet(id: number) {
  return useQuery({
    queryKey: collectionKeys.sheet(id),
    queryFn: () => collectionsApi.getSheet(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

/** What deleting a Collection with its contents would remove, and what blocks it. Always refetched on open. */
export function useCollectionDeletePreflight(type: DeletableCollectionType, id: number, enabled: boolean) {
  return useQuery({
    queryKey: collectionKeys.deletePreflight(type, id),
    queryFn: () => collectionsApi.deletePreflight({ collectionType: type, id }),
    enabled: enabled && Number.isFinite(id) && id > 0,
    staleTime: 0,
    gcTime: 0,
  })
}

/**
 * Delete a Collection, its Containers, the Specimens left with no Containers and, optionally, the Subjects
 * left with no Specimens. The delete reaches the Collections list, dashboard, studies, Subjects and
 * Locations, so every query is invalidated; the deleted Collection's own queries are not refetched.
 */
export function useDeleteCollectionWithContents() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { collectionType: DeletableCollectionType; id: number; removeEmptySubjects: boolean }) =>
      collectionsApi.deleteWithContents(input),
    onSuccess: (_result, { collectionType, id }) => {
      void invalidateAfterBulkWrite(queryClient, { deleted: [collectionKeys.detail(collectionType, id)] })
    },
  })
}
