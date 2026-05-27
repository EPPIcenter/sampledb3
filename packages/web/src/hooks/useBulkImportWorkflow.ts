import { useQuery } from '@tanstack/react-query'
import { collectionsApi } from '../lib/api/collections'
import { specimenTypesApi } from '../lib/api/reference-data'
import { getQueryErrorMessage } from '../ui'
import type { ContainerType } from '../components/ContainerRegistration'
import type { CSVRow, ImportType } from '../lib/bulk-import-validation'

export const bulkImportKeys = {
  all: ['bulk-import'] as const,
  templateTypesByContainer: (containerType: string) =>
    [...bulkImportKeys.all, 'template-types', 'by-container', containerType] as const,
  templateTypesList: () => [...bulkImportKeys.all, 'template-types', 'list'] as const,
}

export type BulkImportMissingCollection = {
  name: string
  barcode?: string
  collectionBarcode?: string
  locationId: number | null
  status: 'pending' | 'creating' | 'success' | 'error'
  error?: string
}

/** Specimen type names for CSV template generation (prefetch when import needs types). */
export function useBulkImportTemplateSpecimenTypes(options: {
  importType: ImportType
  containerType: ContainerType | 'none' | ''
}) {
  const { importType, containerType } = options
  const needsTypes = importType !== 'subjects'
  const useByContainer =
    needsTypes && containerType !== '' && containerType !== 'none'
  const useListAll = needsTypes && containerType === 'none'

  const byContainerQuery = useQuery({
    queryKey: bulkImportKeys.templateTypesByContainer(String(containerType)),
    queryFn: async () => {
      const res = await specimenTypesApi.getByContainerType(String(containerType))
      return res.specimenTypes.map((st) => st.name)
    },
    enabled: useByContainer,
  })

  const listQuery = useQuery({
    queryKey: bulkImportKeys.templateTypesList(),
    queryFn: async () => {
      const res = await specimenTypesApi.list()
      return res.data.map((st) => st.name)
    },
    enabled: useListAll,
  })

  const activeQuery = useByContainer ? byContainerQuery : listQuery

  return {
    specimenTypeNames: needsTypes ? (activeQuery.data ?? []) : [],
    isPending: needsTypes && activeQuery.isPending,
    isError: needsTypes && activeQuery.isError,
    errorMessage:
      needsTypes && activeQuery.isError
        ? getQueryErrorMessage(activeQuery.error, 'Failed to load specimen types for template')
        : null,
    refetch: () => activeQuery.refetch(),
  }
}

/** Resolve which collections from CSV rows are missing on the server. Throws on API failure. */
export async function fetchBulkImportMissingCollections(params: {
  rows: CSVRow[]
  collectionType: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
  getRowCollectionName: (row: CSVRow) => string | undefined
}): Promise<BulkImportMissingCollection[]> {
  const { rows, collectionType, getRowCollectionName } = params

  const uniqueCollections = new Set<string>()
  for (const row of rows) {
    const collectionName = getRowCollectionName(row)
    if (collectionName) uniqueCollections.add(collectionName)
    if (row.collection_barcode) uniqueCollections.add(row.collection_barcode)
  }

  if (uniqueCollections.size === 0) return []

  const checkData = Array.from(uniqueCollections).map((identifier) => ({
    identifier,
    type: collectionType,
  }))

  const response = await collectionsApi.check({ collections: checkData })
  const results = response.results

  const missing: BulkImportMissingCollection[] = []
  const found = new Set<string>()

  for (const result of results) {
    if (!result.exists) {
      const isBarcode =
        result.identifier.match(/^[A-Z0-9-]+$/) != null && result.identifier.length > 5

      if (!found.has(result.identifier)) {
        missing.push({
          name: isBarcode ? '' : result.identifier,
          barcode: isBarcode ? result.identifier : undefined,
          collectionBarcode: isBarcode ? result.identifier : undefined,
          locationId: null,
          status: 'pending',
        })
        found.add(result.identifier)
      }
    } else {
      found.add(result.identifier)
    }
  }

  return missing
}
