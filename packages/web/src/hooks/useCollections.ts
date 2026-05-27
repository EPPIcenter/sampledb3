import { useQuery } from '@tanstack/react-query'
import { collectionsApi } from '../lib/api/collections'
import type { CollectionListItem } from '../lib/collections-browse'

export const collectionKeys = {
  all: ['collections'] as const,
  listAll: () => [...collectionKeys.all, 'list-all'] as const,
  cryovialBox: (id: number) => [...collectionKeys.all, 'cryovial-box', id] as const,
  micronixPlate: (id: number) => [...collectionKeys.all, 'micronix-plate', id] as const,
  box: (id: number) => [...collectionKeys.all, 'box', id] as const,
  bag: (id: number) => [...collectionKeys.all, 'bag', id] as const,
  sheet: (id: number) => [...collectionKeys.all, 'sheet', id] as const,
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
