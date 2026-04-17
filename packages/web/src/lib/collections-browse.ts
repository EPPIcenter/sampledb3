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
 * Rank a collection against the search query:
 *   0 = exact name match, 1 = name starts with, 2 = name contains, 3 = barcode/path only
 */
function searchRank(c: CollectionListItem, q: string): number {
  const nl = c.name.toLowerCase()
  if (nl === q) return 0
  if (nl.startsWith(q)) return 1
  if (nl.includes(q)) return 2
  return 3
}

/**
 * Filter collections by type and optional search query (name, barcode, location path).
 * Case-insensitive; empty/whitespace search is ignored.
 * When searching, results are sorted by relevance: exact name > prefix > contains > barcode/path.
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
  const matches = byType.filter((c) => {
    const nameMatch = c.name.toLowerCase().includes(trimmed)
    const barcodeMatch = (c.barcode?.toLowerCase().includes(trimmed)) ?? false
    const pathMatch = (c.location?.path?.toLowerCase().includes(trimmed)) ?? false
    return nameMatch || barcodeMatch || pathMatch
  })
  matches.sort((a, b) => {
    const ra = searchRank(a, trimmed)
    const rb = searchRank(b, trimmed)
    return ra - rb || a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  })
  return matches
}
