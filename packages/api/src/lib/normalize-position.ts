/** Normalize position string to match frontend format (e.g., "B1" -> "B01"). */
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
