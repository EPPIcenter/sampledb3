/**
 * Well position utilities for micronix plates (96-well: A01–H12), on the shared Grid position
 * rule from `@sampledb/contract`.
 */
import { gridCellKeys, gridPositionKey } from '@sampledb/contract'

/** Set of all 96 well positions for a standard micronix plate (8×12). */
export const MICRONIX_WELL_POSITIONS_96: Set<string> = new Set(gridCellKeys('micronix_plate'))

/**
 * Normalize well position to A01 style (row A–H, column 01–12).
 * Returns normalized position or null if invalid.
 */
export function normalizeWellPosition(pos: string): string | null {
  return gridPositionKey(pos, 'micronix_plate')
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
