/**
 * Normalize a position for a lookup against stored rows ("B1" -> "B01"). Passes anything
 * else through unchanged so a legacy position (e.g. "--A01") still finds its row. Not for
 * writes: a write checks the position with `parseGridPosition` from `@sampledb/contract`.
 */
export function normalizePosition(position: string | null | undefined): string | null {
  if (!position || !position.trim()) return null

  const trimmed = position.trim()
  const match = trimmed.match(/^([A-Z]+)(\d+)$/i)
  if (match) {
    const row = match[1].toUpperCase()
    const col = match[2]
    return `${row}${col.padStart(2, '0')}`
  }

  return trimmed
}
