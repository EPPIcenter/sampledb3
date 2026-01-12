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
import { useToast } from '../contexts/ToastContext'

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
  const { error: showError } = useToast()
  
  return useQuery({
    queryKey: specimenTypeKeys.list(),
    queryFn: async () => {
      try {
        const res = await specimenTypesApi.list()
        return res.data
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to load specimen types')
        throw err
      }
    },
  })
}

export function useSpecimenType(id: number) {
  const { error: showError } = useToast()
  
  return useQuery({
    queryKey: specimenTypeKeys.detail(id),
    queryFn: async () => {
      try {
        return await specimenTypesApi.get(id)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to load specimen type')
        throw err
      }
    },
    enabled: !!id,
  })
}

export function useCreateSpecimenType() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (data: Omit<SpecimenType, 'id' | 'created' | 'lastUpdated'>) => {
      try {
        return await specimenTypesApi.create(data)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to create specimen type')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specimenTypeKeys.lists() })
      success('Specimen type created successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

export function useUpdateSpecimenType() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SpecimenType> }) => {
      try {
        return await specimenTypesApi.update(id, data)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to update specimen type')
        throw err
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: specimenTypeKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: specimenTypeKeys.lists() })
      success('Specimen type updated successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

export function useDeleteSpecimenType() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await specimenTypesApi.delete(id)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to delete specimen type')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specimenTypeKeys.lists() })
      success('Specimen type deleted successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

// States
// Tags (replaces States)
export function useTags() {
  const { error: showError } = useToast()
  
  return useQuery({
    queryKey: tagKeys.list(),
    queryFn: async () => {
      try {
        const res = await tagsApi.list()
        return res.data
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to load tags')
        throw err
      }
    },
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (data: Omit<Tag, 'id'>) => {
      try {
        return await tagsApi.create(data)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to create tag')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
      success('Tag created successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Tag> }) => {
      try {
        return await tagsApi.update(id, data)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to update tag')
        throw err
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
      success('Tag updated successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await tagsApi.delete(id)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to delete tag')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
      success('Tag deleted successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

// Storage Types
export function useStorageTypes() {
  const { error: showError } = useToast()
  
  return useQuery({
    queryKey: storageTypeKeys.list(),
    queryFn: async () => {
      try {
        const res = await storageTypesApi.list()
        return res.data
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to load storage types')
        throw err
      }
    },
  })
}

export function useCreateStorageType() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (data: Omit<StorageType, 'id'>) => {
      try {
        return await storageTypesApi.create(data)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to create storage type')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageTypeKeys.lists() })
      success('Storage type created successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

export function useUpdateStorageType() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<StorageType> }) => {
      try {
        return await storageTypesApi.update(id, data)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to update storage type')
        throw err
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: storageTypeKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: storageTypeKeys.lists() })
      success('Storage type updated successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

export function useDeleteStorageType() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await storageTypesApi.delete(id)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to delete storage type')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageTypeKeys.lists() })
      success('Storage type deleted successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

// Strains
export function useStrains() {
  const { error: showError } = useToast()
  
  return useQuery({
    queryKey: strainKeys.list(),
    queryFn: async () => {
      try {
        const res = await strainsApi.list()
        return res.data
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to load strains')
        throw err
      }
    },
  })
}

export function useCreateStrain() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (data: Omit<Strain, 'id'>) => {
      try {
        return await strainsApi.create(data)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to create strain')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: strainKeys.lists() })
      success('Strain created successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

export function useUpdateStrain() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Strain> }) => {
      try {
        return await strainsApi.update(id, data)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to update strain')
        throw err
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: strainKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: strainKeys.lists() })
      success('Strain updated successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

export function useDeleteStrain() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await strainsApi.delete(id)
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to delete strain')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: strainKeys.lists() })
      success('Strain deleted successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

// Compositions - REMOVED: No longer used (strains are now embedded in control definitions via properties JSON)



