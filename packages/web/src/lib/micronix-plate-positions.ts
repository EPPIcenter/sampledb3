/**
 * Well position utilities for micronix plates (96-well: A01–H12).
 * Structured so other layouts (e.g. 384-well) can be added later.
 */

const ROWS_96 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
const COLS_96 = 12

/** Set of all 96 well positions for a standard micronix plate (8×12). */
export const MICRONIX_WELL_POSITIONS_96: Set<string> = new Set(
  ROWS_96.flatMap((row) =>
    Array.from({ length: COLS_96 }, (_, i) => {
      const col = i + 1
      return `${row}${col.toString().padStart(2, '0')}`
    })
  )
)

/**
 * Normalize well position to A01 style (row A–H, column 01–12).
 * Returns normalized position or null if invalid.
 */
export function normalizeWellPosition(pos: string): string | null {
  const t = pos.trim()
  if (!t) return null
  const match = t.match(/^([A-Ha-h])(\d{1,2})$/i)
  if (!match) return null
  const row = match[1].toUpperCase()
  const col = parseInt(match[2], 10)
  if (Number.isNaN(col) || col < 1 || col > 12) return null
  return `${row}${col.toString().padStart(2, '0')}`
}

export interface FullPlateValidationResult {
  valid: boolean
  missing?: string[]
  extra?: string[]
}

/**
 * Check that the set of positions equals the 96-well set exactly.
 * Returns missing and/or extra positions for error messages.
 */
export function validateFullPlatePositions(
  positions: Set<string>,
  expected: Set<string> = MICRONIX_WELL_POSITIONS_96
): FullPlateValidationResult {
  const missing: string[] = []
  const extra: string[] = []
  for (const p of expected) {
    if (!positions.has(p)) missing.push(p)
  }
  for (const p of positions) {
    if (!expected.has(p)) extra.push(p)
  }
  if (missing.length > 0) missing.sort()
  if (extra.length > 0) extra.sort()
  return {
    valid: missing.length === 0 && extra.length === 0,
    ...(missing.length > 0 && { missing }),
    ...(extra.length > 0 && { extra }),
  }
}
