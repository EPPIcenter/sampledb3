import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  specimenTypesApi,
  tagsApi,
  storageTypesApi,
  strainsApi,
  type SpecimenType,
  type Tag,
  type StorageType,
  type Strain,
} from '../lib/api'

// Generic reference data keys factory
function createReferenceDataKeys<T extends string>(type: T) {
  return {
    all: [type] as const,
    lists: () => [type, 'list'] as const,
    list: () => [type, 'list'] as const,
    details: () => [type, 'detail'] as const,
    detail: (id: number) => [type, 'detail', id] as const,
  }
}

export const specimenTypeKeys = createReferenceDataKeys('specimen-types')
export const tagKeys = createReferenceDataKeys('tags')
export const storageTypeKeys = createReferenceDataKeys('storage-types')
export const strainKeys = createReferenceDataKeys('strains')
// compositionKeys - REMOVED: Compositions no longer used

// Specimen Types
export function useSpecimenTypes() {
  return useQuery({
    queryKey: specimenTypeKeys.list(),
    queryFn: async () => {
      const res = await specimenTypesApi.list()
      return res.data.specimenTypes
    },
  })
}

export function useSpecimenType(id: number) {
  return useQuery({
    queryKey: specimenTypeKeys.detail(id),
    queryFn: async () => {
      const res = await specimenTypesApi.get(id)
      return res.data.specimenType
    },
    enabled: !!id,
  })
}

export function useCreateSpecimenType() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: Omit<SpecimenType, 'id' | 'created' | 'lastUpdated'>) => {
      const res = await specimenTypesApi.create(data)
      return res.data.specimenType
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specimenTypeKeys.lists() })
    },
  })
}

export function useUpdateSpecimenType() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SpecimenType> }) => {
      const res = await specimenTypesApi.update(id, data)
      return res.data.specimenType
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: specimenTypeKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: specimenTypeKeys.lists() })
    },
  })
}

export function useDeleteSpecimenType() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: number) => {
      await specimenTypesApi.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specimenTypeKeys.lists() })
    },
  })
}

// States
// Tags (replaces States)
export function useTags() {
  return useQuery({
    queryKey: tagKeys.list(),
    queryFn: async () => {
      const res = await tagsApi.list()
      return res.data.tags
    },
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: Omit<Tag, 'id'>) => {
      const res = await tagsApi.create(data)
      return res.data.tag
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Tag> }) => {
      const res = await tagsApi.update(id, data)
      return res.data.tag
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: number) => {
      await tagsApi.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },
  })
}

// Storage Types
export function useStorageTypes() {
  return useQuery({
    queryKey: storageTypeKeys.list(),
    queryFn: async () => {
      const res = await storageTypesApi.list()
      return res.data.storageTypes
    },
  })
}

export function useCreateStorageType() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: Omit<StorageType, 'id'>) => {
      const res = await storageTypesApi.create(data)
      return res.data.storageType
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageTypeKeys.lists() })
    },
  })
}

export function useUpdateStorageType() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<StorageType> }) => {
      const res = await storageTypesApi.update(id, data)
      return res.data.storageType
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: storageTypeKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: storageTypeKeys.lists() })
    },
  })
}

export function useDeleteStorageType() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: number) => {
      await storageTypesApi.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageTypeKeys.lists() })
    },
  })
}

// Strains
export function useStrains() {
  return useQuery({
    queryKey: strainKeys.list(),
    queryFn: async () => {
      const res = await strainsApi.list()
      return res.data.strains
    },
  })
}

export function useCreateStrain() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: Omit<Strain, 'id'>) => {
      const res = await strainsApi.create(data)
      return res.data.strain
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: strainKeys.lists() })
    },
  })
}

export function useUpdateStrain() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Strain> }) => {
      const res = await strainsApi.update(id, data)
      return res.data.strain
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: strainKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: strainKeys.lists() })
    },
  })
}

export function useDeleteStrain() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: number) => {
      await strainsApi.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: strainKeys.lists() })
    },
  })
}

// Compositions - REMOVED: No longer used (strains are now embedded in control definitions via properties JSON)



