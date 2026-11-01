/** How a sortable value is ordered. */
export type SortType = 'text' | 'number' | 'date'

export type SortDirection = 'asc' | 'desc'

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Natural, case-insensitive text order that ignores surrounding whitespace: runs of
 * digits compare by value, so `2` sorts before `10` and `S2` before `S10`.
 */
export function compareText(a: string, b: string): number {
  return naturalCollator.compare(a.trim(), b.trim())
}

/** The comparable key for a value, or null when the value is missing or not of the type. */
function sortKey(value: unknown, type: SortType): string | number | null {
  if (value === null || value === undefined) return null
  switch (type) {
    case 'text':
      return String(value)
    case 'number': {
      if (typeof value === 'string' && value.trim() === '') return null
      const n = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(n) ? n : null
    }
    case 'date': {
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
      if (typeof value !== 'string' && typeof value !== 'number') return null
      if (typeof value === 'string' && value.trim() === '') return null
      const t = new Date(value).getTime()
      return Number.isNaN(t) ? null : t
    }
  }
}

/**
 * Compare two values by their declared sort type in the given direction. Missing values
 * (null, undefined, blank, or unparseable for numbers and dates) sort last in either
 * direction.
 */
export function compareBySortType(a: unknown, b: unknown, type: SortType, direction: SortDirection): number {
  const aKey = sortKey(a, type)
  const bKey = sortKey(b, type)
  if (aKey === null && bKey === null) return 0
  if (aKey === null) return 1
  if (bKey === null) return -1
  const ascending =
    typeof aKey === 'string' && typeof bKey === 'string'
      ? compareText(aKey, bKey)
      : (aKey as number) - (bKey as number)
  return direction === 'asc' ? ascending : -ascending
}
