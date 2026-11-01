import { useQuery, useMutation, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { specimenTypesApi, tagsApi, storageTypesApi, strainsApi } from '../lib/api/reference-data'
import type { SpecimenType } from '../lib/api/types'
import type { Tag, StorageType, Strain } from '../lib/api/reference-data'
import { useToast } from '../contexts/ToastContext'
import type { ReferenceDataType } from '../config/reference-data-config'
import { invalidateAfterBulkWrite } from '../lib/query-client'
import { referenceDataPageKeys } from './useReferenceDataPage'

// Generic reference data keys factory
function createReferenceDataKeys<T extends ReferenceDataType>(type: T) {
  return {
    all: [type] as const,
    lists: () => [type, 'list'] as const,
    list: () => [type, 'list'] as const,
    details: () => [type, 'detail'] as const,
    detail: (id: number) => referenceDataDetailKey(type, id),
  }
}

function referenceDataDetailKey<T extends ReferenceDataType>(type: T, id: number) {
  return [type, 'detail', id] as const
}

/**
 * Refresh queries after a Reference data write. Reference data appears on most pages (a Tag on
 * Containers and the export filters, a specimen type on Specimens, Collections and the Specimen
 * form, a strain on Controls), so every query is invalidated. A deleted item's own queries are
 * not refetched.
 */
export function invalidateAfterReferenceDataWrite(
  queryClient: QueryClient,
  deletedItem?: { type: ReferenceDataType; id: number }
) {
  const deleted: QueryKey[] = []
  if (deletedItem) {
    deleted.push(referenceDataDetailKey(deletedItem.type, deletedItem.id))
    if (deletedItem.type === 'specimen-types') {
      deleted.push(referenceDataPageKeys.containerTypes(deletedItem.id))
    }
  }
  return invalidateAfterBulkWrite(queryClient, { deleted })
}

export const specimenTypeKeys = createReferenceDataKeys('specimen-types')
export const tagKeys = createReferenceDataKeys('tags')
export const storageTypeKeys = createReferenceDataKeys('storage-types')
export const strainKeys = createReferenceDataKeys('strains')
// compositionKeys - REMOVED: Compositions no longer used

// Specimen Types
export function useSpecimenTypes(options?: { silent?: boolean }) {
  const { error: showError } = useToast()
  
  return useQuery({
    queryKey: specimenTypeKeys.list(),
    queryFn: async () => {
      try {
        const res = await specimenTypesApi.list()
        return res.data
      } catch (err: any) {
        if (!options?.silent) {
          showError(err.response?.data?.error || 'Failed to load specimen types')
        }
        throw err
      }
    },
  })
}

/** Allowed container types for a specimen type (forms, wizards). */
export function useSpecimenTypeContainerTypesForId(specimenTypeId: number) {
  return useQuery({
    queryKey: [...specimenTypeKeys.detail(specimenTypeId), 'container-types'] as const,
    queryFn: () => specimenTypesApi.getContainerTypes(specimenTypeId),
    enabled: specimenTypeId > 0,
  })
}

/** Specimen types that support a given container type. */
export function useSpecimenTypesByContainerType(
  containerType: 'paper' | 'cryovial_tube' | 'micronix_tube' | undefined,
) {
  return useQuery({
    queryKey: [...specimenTypeKeys.lists(), 'by-container', containerType] as const,
    queryFn: async () => {
      const res = await specimenTypesApi.getByContainerType(containerType!)
      return res.specimenTypes
    },
    enabled: !!containerType,
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
      void invalidateAfterReferenceDataWrite(queryClient)
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
    onSuccess: () => {
      void invalidateAfterReferenceDataWrite(queryClient)
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
    onSuccess: (_result, id) => {
      void invalidateAfterReferenceDataWrite(queryClient, { type: 'specimen-types', id })
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
      void invalidateAfterReferenceDataWrite(queryClient)
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
    onSuccess: () => {
      void invalidateAfterReferenceDataWrite(queryClient)
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
    onSuccess: (_result, id) => {
      void invalidateAfterReferenceDataWrite(queryClient, { type: 'tags', id })
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
      void invalidateAfterReferenceDataWrite(queryClient)
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
    onSuccess: () => {
      void invalidateAfterReferenceDataWrite(queryClient)
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
    onSuccess: (_result, id) => {
      void invalidateAfterReferenceDataWrite(queryClient, { type: 'storage-types', id })
      success('Storage type deleted successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

// Strains
export function useStrains(options?: { silent?: boolean }) {
  const { error: showError } = useToast()

  return useQuery({
    queryKey: strainKeys.list(),
    queryFn: async () => {
      try {
        const res = await strainsApi.list()
        return res.data
      } catch (err: unknown) {
        if (!options?.silent) {
          const message =
            err && typeof err === 'object' && 'response' in err
              ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
              : undefined
          showError(message || 'Failed to load strains')
        }
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
      void invalidateAfterReferenceDataWrite(queryClient)
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
    onSuccess: () => {
      void invalidateAfterReferenceDataWrite(queryClient)
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
    onSuccess: (_result, id) => {
      void invalidateAfterReferenceDataWrite(queryClient, { type: 'strains', id })
      success('Strain deleted successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

// Compositions - REMOVED: No longer used (strains are now embedded in control definitions via properties JSON)



