/**
 * Grid geometry of the Collections that hold tube and well Containers, and the
 * rule that maps a stored grid position onto that geometry.
 *
 * A stored position that does not map onto the grid (missing, out of range, or
 * not a row letter plus column number) leaves its Container unplaced: it
 * belongs to the Collection but occupies no cell.
 */

export type CollectionGrid = {
  /** Row letters, top to bottom. */
  readonly rows: readonly string[]
  /** Column numbers, left to right. */
  readonly columns: readonly number[]
}

function letters(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i))
}

function numbers(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1)
}

/** 96-well micronix plate: rows A–H, columns 1–12. */
export const MICRONIX_PLATE_GRID: CollectionGrid = { rows: letters(8), columns: numbers(12) }

/** 100-slot cryovial box: rows A–J, columns 1–10. */
export const CRYOVIAL_BOX_GRID: CollectionGrid = { rows: letters(10), columns: numbers(10) }

/** Cell key for a row and column, e.g. `B` and `7` give `B07`. */
export function gridCellKey(row: string, column: number): string {
  return `${row}${String(column).padStart(2, '0')}`
}

/** Every cell key of the grid, row by row (A01, A02, …, B01, …). */
export function gridCellKeys(grid: CollectionGrid): string[] {
  return grid.rows.flatMap((row) => grid.columns.map((column) => gridCellKey(row, column)))
}

/**
 * The grid cell a stored position names, or null when the Container is unplaced.
 * `a1`, `A1` and ` A01 ` all give `A01`; `Z99`, `--A01`, `NA01` and null give null.
 */
export function gridPositionKey(position: string | null | undefined, grid: CollectionGrid): string | null {
  if (position == null) return null
  const match = /^([A-Za-z])(\d{1,3})$/.exec(position.trim())
  if (!match) return null
  const row = match[1]!.toUpperCase()
  const column = parseInt(match[2]!, 10)
  if (!grid.rows.includes(row) || !grid.columns.includes(column)) return null
  return gridCellKey(row, column)
}
