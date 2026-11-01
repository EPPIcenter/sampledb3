/**
 * Well position utilities for micronix plates (96-well: A01–H12), on the shared Grid position
 * rule from `@sampledb/contract`.
 */
import { GRID_GEOMETRY, parseGridPosition } from '@sampledb/contract'

const { rows: PLATE_ROWS, columns: PLATE_COLUMNS } = GRID_GEOMETRY.micronix_plate

/** Set of all 96 well positions for a standard micronix plate (8×12). */
export const MICRONIX_WELL_POSITIONS_96: Set<string> = new Set(
  Array.from({ length: PLATE_ROWS }, (_, r) =>
    Array.from({ length: PLATE_COLUMNS }, (_, c) => `${String.fromCharCode(65 + r)}${String(c + 1).padStart(2, '0')}`),
  ).flat(),
)

/**
 * Normalize well position to A01 style (row A–H, column 01–12).
 * Returns normalized position or null if invalid.
 */
export function normalizeWellPosition(pos: string): string | null {
  const parsed = parseGridPosition(pos, 'micronix_plate')
  return parsed.ok ? parsed.position : null
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
