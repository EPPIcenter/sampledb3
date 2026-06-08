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
  collectionType?: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
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
  collectionType?: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
  getRowCollectionName?: (row: CSVRow) => string | undefined
  getRowCollectionCheck?: (
    row: CSVRow
  ) => { identifier: string; type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' } | undefined
}): Promise<BulkImportMissingCollection[]> {
  const { rows, collectionType, getRowCollectionName, getRowCollectionCheck } = params

  const checkData: Array<{ identifier: string; type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' }> =
    []
  const seen = new Set<string>()

  for (const row of rows) {
    if (getRowCollectionCheck) {
      const check = getRowCollectionCheck(row)
      if (check) {
        const key = `${check.type}:${check.identifier}`
        if (!seen.has(key)) {
          checkData.push(check)
          seen.add(key)
        }
      }
    } else if (collectionType && getRowCollectionName) {
      const collectionName = getRowCollectionName(row)
      if (collectionName && !seen.has(`${collectionType}:${collectionName}`)) {
        checkData.push({ identifier: collectionName, type: collectionType })
        seen.add(`${collectionType}:${collectionName}`)
      }
    }
    if (row.collection_barcode && collectionType) {
      const key = `${collectionType}:${row.collection_barcode}`
      if (!seen.has(key)) {
        checkData.push({ identifier: row.collection_barcode, type: collectionType })
        seen.add(key)
      }
    }
  }

  if (checkData.length === 0) return []

  const response = await collectionsApi.check({ collections: checkData })
  const results = response.results

  const missing: BulkImportMissingCollection[] = []
  const found = new Set<string>()

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const check = checkData[i]
    if (!result.exists) {
      const isBarcode =
        result.identifier.match(/^[A-Z0-9-]+$/) != null && result.identifier.length > 5

      const dedupeKey = `${check.type}:${result.identifier}`
      if (!found.has(dedupeKey)) {
        missing.push({
          name: isBarcode ? '' : result.identifier,
          collectionType: check.type,
          barcode: isBarcode ? result.identifier : undefined,
          collectionBarcode: isBarcode ? result.identifier : undefined,
          locationId: null,
          status: 'pending',
        })
        found.add(dedupeKey)
      }
    } else {
      found.add(`${check.type}:${result.identifier}`)
    }
  }

  return missing
}
