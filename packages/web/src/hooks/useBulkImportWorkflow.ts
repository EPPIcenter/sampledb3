import { useQuery } from '@tanstack/react-query'
import { collectionsApi } from '../lib/api/collections'
import { specimenTypesApi } from '../lib/api/reference-data'
import { getQueryErrorMessage } from '../ui'
import type { ContainerType } from '../components/ContainerRegistration'
import type {
  BulkImportCollectionRef,
  BulkImportCollectionType,
  CSVRow,
  ImportType,
} from '../lib/bulk-import-validation'

export const bulkImportKeys = {
  all: ['bulk-import'] as const,
  templateTypesByContainer: (containerType: string) =>
    [...bulkImportKeys.all, 'template-types', 'by-container', containerType] as const,
  templateTypesList: () => [...bulkImportKeys.all, 'template-types', 'list'] as const,
}

export type BulkImportMissingCollection = {
  /** From the CSV name column; empty when the rows give only a Collection barcode. */
  name: string
  collectionType?: BulkImportCollectionType
  /** From the CSV collection_barcode column. */
  barcode?: string
  /** Typed in the wizard when the CSV gives no Collection barcode. */
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

/**
 * Resolve which Collections the CSV rows reference that the server does not have yet.
 * Each row's name and barcode come from their own columns (see getBulkImportRowCollectionRef),
 * so one row yields at most one Collection to create. Throws on API failure.
 */
export async function fetchBulkImportMissingCollections(params: {
  rows: CSVRow[]
  getRowCollectionRef: (row: CSVRow) => BulkImportCollectionRef | undefined
}): Promise<BulkImportMissingCollection[]> {
  const { rows, getRowCollectionRef } = params

  // One entry per Collection: rows that share a name (or, without a name, a barcode) share it.
  const refs = new Map<string, BulkImportCollectionRef>()
  for (const row of rows) {
    const ref = getRowCollectionRef(row)
    if (!ref) continue
    const key = ref.name ? `${ref.type}:name:${ref.name}` : `${ref.type}:barcode:${ref.barcode ?? ''}`
    const existing = refs.get(key)
    if (!existing) {
      refs.set(key, ref)
    } else if (!existing.barcode && ref.barcode) {
      existing.barcode = ref.barcode
    }
  }

  const checkData: Array<{ identifier: string; type: BulkImportCollectionType }> = []
  const checkIndex = new Map<string, number>()
  const addCheck = (type: BulkImportCollectionType, identifier: string) => {
    const key = `${type}:${identifier}`
    if (checkIndex.has(key)) return
    checkIndex.set(key, checkData.length)
    checkData.push({ identifier, type })
  }
  for (const ref of refs.values()) {
    if (ref.name) addCheck(ref.type, ref.name)
    if (ref.barcode) addCheck(ref.type, ref.barcode)
  }

  if (checkData.length === 0) return []

  const { results } = await collectionsApi.check({ collections: checkData })
  const exists = (type: BulkImportCollectionType, identifier: string | undefined) => {
    if (!identifier) return false
    const index = checkIndex.get(`${type}:${identifier}`)
    return index != null && results[index]?.exists === true
  }

  const missing: BulkImportMissingCollection[] = []
  for (const ref of refs.values()) {
    if (exists(ref.type, ref.name) || exists(ref.type, ref.barcode)) continue
    missing.push({
      name: ref.name ?? '',
      collectionType: ref.type,
      ...(ref.barcode ? { barcode: ref.barcode } : {}),
      locationId: null,
      status: 'pending',
    })
  }
  return missing
}
