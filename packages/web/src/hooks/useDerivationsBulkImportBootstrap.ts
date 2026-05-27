import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { specimenTypesApi, unitsApi } from '../lib/api/reference-data'
import { getQueryErrorMessage } from '../ui'
import { useSpecimenTypes } from './useReferenceData'

export const derivationsBulkImportKeys = {
  all: ['derivations-bulk-import'] as const,
  units: () => [...derivationsBulkImportKeys.all, 'units'] as const,
  containerTypes: (specimenTypeId: number) =>
    [...derivationsBulkImportKeys.all, 'container-types', specimenTypeId] as const,
}

/** Bootstrap catalogs for {@link DerivationsBulkImport} (specimen types, units, allowed container types). */
export function useDerivationsBulkImportBootstrap(specimenTypeName: string) {
  const specimenTypesQuery = useSpecimenTypes({ silent: true })

  const unitsQuery = useQuery({
    queryKey: derivationsBulkImportKeys.units(),
    queryFn: () => unitsApi.listAll(),
  })

  const selectedSpecimenTypeId = useMemo(() => {
    if (!specimenTypeName) return 0
    return specimenTypesQuery.data?.find((st) => st.name === specimenTypeName)?.id ?? 0
  }, [specimenTypesQuery.data, specimenTypeName])

  const containerTypesQuery = useQuery({
    queryKey: derivationsBulkImportKeys.containerTypes(selectedSpecimenTypeId),
    queryFn: async () => {
      const res = await specimenTypesApi.getContainerTypes(selectedSpecimenTypeId)
      return res.containerTypes
    },
    enabled: selectedSpecimenTypeId > 0,
  })

  const bootstrapLoading = specimenTypesQuery.isPending || unitsQuery.isPending
  const bootstrapError = specimenTypesQuery.isError
    ? getQueryErrorMessage(specimenTypesQuery.error, 'Failed to load specimen types')
    : unitsQuery.isError
      ? getQueryErrorMessage(unitsQuery.error, 'Failed to load units')
      : null

  const containerTypesError =
    specimenTypeName && selectedSpecimenTypeId > 0 && containerTypesQuery.isError
      ? getQueryErrorMessage(
          containerTypesQuery.error,
          'Failed to load allowed container types for this specimen type',
        )
      : null

  return {
    specimenTypes: specimenTypesQuery.data ?? [],
    units: unitsQuery.data ?? [],
    allowedContainerTypes: containerTypesQuery.data ?? [],
    bootstrapLoading,
    bootstrapError,
    containerTypesError,
    refetchBootstrap: () => {
      void specimenTypesQuery.refetch()
      void unitsQuery.refetch()
      if (selectedSpecimenTypeId > 0) void containerTypesQuery.refetch()
    },
  }
}
