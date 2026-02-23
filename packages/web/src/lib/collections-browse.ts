/**
 * Types and helpers for the Collections browse page (client-side filtering).
 */

export type CollectionListType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'

export interface CollectionListItem {
  id: number
  name: string
  type: CollectionListType
  barcode: string | null
  locationId: number | null
  itemCount: number
  location: { id: number; path: string | null } | null
}

export type CollectionTypeFilter = 'all' | CollectionListType

/**
 * Filter collections by type and optional search query (name, barcode, location path).
 * Case-insensitive; empty/whitespace search is ignored.
 */
export function filterCollections(
  collections: CollectionListItem[],
  search: string,
  typeFilter: CollectionTypeFilter
): CollectionListItem[] {
  const trimmed = search.trim().toLowerCase()
  const byType =
    typeFilter === 'all'
      ? collections
      : collections.filter((c) => c.type === typeFilter)
  if (trimmed === '') return byType
  return byType.filter((c) => {
    const nameMatch = c.name?.toLowerCase().includes(trimmed) ?? false
    const barcodeMatch = c.barcode?.toLowerCase().includes(trimmed) ?? false
    const pathMatch = c.location?.path?.toLowerCase().includes(trimmed) ?? false
    return nameMatch || barcodeMatch || pathMatch
  })
}
