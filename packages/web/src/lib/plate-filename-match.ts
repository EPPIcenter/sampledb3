/**
 * Extract a plate-name stem from a filename by removing extension and common date/time suffixes.
 * Used to suggest which micronix plate a scanned CSV corresponds to when filenames include scan timestamps.
 */
export function extractPlateStemFromFilename(filename: string): string {
  // Use only the base name (no path)
  const baseName = filename.replace(/^.*[/\\]/, '').trim()
  if (!baseName) return ''

  // Remove .csv / .CSV extension
  let stem = baseName.replace(/\.csv$/i, '').trim()
  if (!stem) return ''

  // Strip date/time suffixes (underscore or hyphen) repeatedly until no match
  const dateTimePatterns = [
    // ISO-style and compact datetime
    /[_-]\d{4}-\d{2}-\d{2}T\d{6}$/i,
    /[_-]\d{8}[_-]\d{6}$/,
    /[_-]\d{8}[_-]\d{4}$/,
    // Date variants
    /[_-]\d{4}-\d{2}-\d{2}$/,
    /[_-]\d{8}$/,
    /[_-]\d{2}-\d{2}-\d{4}$/,
    /[_-]\d{2}-\d{2}-\d{2}$/,
    // Time variants
    /[_-]\d{1,2}-\d{2}-\d{2}$/, // e.g. _14-30-00
    /[_-]\d{6}$/,               // e.g. _143000
    /[_-]\d{1,2}-\d{2}-[AP]M$/i,
  ]

  let changed = true
  while (changed) {
    changed = false
    for (const re of dateTimePatterns) {
      const next = stem.replace(re, '')
      if (next !== stem) {
        stem = next.replace(/[_-]+$/, '').trim()
        changed = true
        break
      }
    }
  }

  return stem
}

export type PlateCandidate = { id: number; name: string; matchType: 'exact' | 'contains' | 'reverse_contains' }

/**
 * Given a stem (e.g. from filename) and a list of plates, return matching plate candidates
 * sorted by relevance: exact first, then contains, then reverse contains; ties broken by shorter name.
 */
export function findPlateCandidatesFromStem(
  stem: string,
  plates: Array<{ id: number; name: string }>
): PlateCandidate[] {
  if (!stem || plates.length === 0) return []

  const stemLower = stem.toLowerCase()
  const exact: PlateCandidate[] = []
  const contains: PlateCandidate[] = []
  const reverseContains: PlateCandidate[] = []

  for (const p of plates) {
    const nameLower = p.name.toLowerCase()
    if (nameLower === stemLower) {
      exact.push({ id: p.id, name: p.name, matchType: 'exact' })
    } else if (nameLower.includes(stemLower)) {
      contains.push({ id: p.id, name: p.name, matchType: 'contains' })
    } else if (stemLower.includes(nameLower)) {
      reverseContains.push({ id: p.id, name: p.name, matchType: 'reverse_contains' })
    }
  }

  const sortByNameLength = (a: PlateCandidate, b: PlateCandidate) =>
    a.name.length - b.name.length

  exact.sort(sortByNameLength)
  contains.sort(sortByNameLength)
  reverseContains.sort(sortByNameLength)

  return [...exact, ...contains, ...reverseContains]
}
