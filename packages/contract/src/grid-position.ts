/**
 * The Grid position rule: which wells or slots a plate or box has, and how a position maps
 * onto one. It is the only geometry and the only parser for Grid positions, so the write
 * paths and the read paths cannot disagree:
 *
 * - Every Container write that sets a Grid position (moves, Scan moves, bulk import, Specimen
 *   registration, derivations) checks the position with `parseGridPosition`.
 * - Every read that lays Containers out on the grid (plate and box detail, plate scan
 *   validation) finds a Container's cell with `gridPositionKey`, which is `parseGridPosition`
 *   with failure meaning "unplaced".
 */

/** A Collection whose Containers sit at Grid positions. */
export type GridCollectionType = 'micronix_plate' | 'cryovial_box'

export interface GridGeometry {
  /** Row count; rows are lettered from A. */
  rows: number
  /** Column count; columns are numbered from 1. */
  columns: number
}

/**
 * Plate and box dimensions. SampleDB stores no size per Collection, so each type has one
 * geometry: micronix plates are 96-well (8×12). Cryovial boxes in use are 9×9 and 10×10, so a
 * box allows the larger, A–J by 1–10.
 */
export const GRID_GEOMETRY: Readonly<Record<GridCollectionType, Readonly<GridGeometry>>> = {
  micronix_plate: { rows: 8, columns: 12 },
  cryovial_box: { rows: 10, columns: 10 },
}

export type GridPositionResult = { ok: true; position: string } | { ok: false; error: string }

const COLLECTION_LABEL: Record<GridCollectionType, string> = {
  micronix_plate: 'micronix plate',
  cryovial_box: 'cryovial box',
}

/**
 * A row letter and a column number of one or two digits. No geometry has more than 12
 * columns, so a third digit (`A001`) is never needed, and no write path produces it.
 */
const POSITION_PATTERN = /^([A-Za-z])(\d{1,2})$/

/** Row letters and column numbers of a Collection type's grid, in display order. */
export function gridAxes(collectionType: GridCollectionType): { rows: string[]; columns: number[] } {
  const { rows, columns } = GRID_GEOMETRY[collectionType]
  return {
    rows: Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i)),
    columns: Array.from({ length: columns }, (_, i) => i + 1),
  }
}

/** Stored form of a row and column, e.g. `B` and `7` give `B07`. */
export function gridCellKey(row: string, column: number): string {
  return `${row}${String(column).padStart(2, '0')}`
}

/** Every stored Grid position of a Collection type, row by row (A01, A02, …, B01, …). */
export function gridCellKeys(collectionType: GridCollectionType): string[] {
  const { rows, columns } = gridAxes(collectionType)
  return rows.flatMap((row) => columns.map((column) => gridCellKey(row, column)))
}

/** The range of a Collection type's Grid positions, as in "A01–H12". */
export function gridPositionRange(collectionType: GridCollectionType): string {
  const { rows, columns } = GRID_GEOMETRY[collectionType]
  return `A01–${gridCellKey(String.fromCharCode(64 + rows), columns)}`
}

/**
 * Parse a typed Grid position for a Collection type. Accepts a row letter and a column number
 * in either case, with or without a leading zero (`a1`, `A1`, `A01`), and returns it in
 * stored form (`A01`). Rejects anything else, including a position outside the plate or box,
 * with an error that names the value.
 */
export function parseGridPosition(raw: string, collectionType: GridCollectionType): GridPositionResult {
  const value = raw.trim()
  const label = COLLECTION_LABEL[collectionType]
  const range = gridPositionRange(collectionType)
  if (value === '') return { ok: false, error: `Position is required for a ${label} (${range})` }

  const match = POSITION_PATTERN.exec(value)
  if (!match) {
    return {
      ok: false,
      error: `Position "${value}" is not a grid position: use a row letter and a column number, such as A01 (${label}: ${range})`,
    }
  }

  const row = match[1]!.toUpperCase()
  const column = parseInt(match[2]!, 10)
  const { rows, columns } = GRID_GEOMETRY[collectionType]
  if (row.charCodeAt(0) - 65 >= rows || column < 1 || column > columns) {
    return { ok: false, error: `Position "${value}" is outside a ${label} (${range})` }
  }
  return { ok: true, position: gridCellKey(row, column) }
}

/**
 * The grid cell a stored position names, or null when the Container is unplaced: its position
 * is missing or fails `parseGridPosition`. `a1`, `A1` and ` A01 ` all give `A01`; `Z99`,
 * `--A01`, `NA01` and null give null.
 */
export function gridPositionKey(position: string | null | undefined, collectionType: GridCollectionType): string | null {
  if (position == null) return null
  const parsed = parseGridPosition(position, collectionType)
  return parsed.ok ? parsed.position : null
}

/**
 * Whether a stored position is valid as stored: missing, or already in the stored form the
 * rule produces. Occupancy compares stored strings, so `A1` next to `A01` would let two
 * Containers share a cell; the integrity report flags any position this rejects.
 */
export function isStoredGridPosition(position: string | null | undefined, collectionType: GridCollectionType): boolean {
  return position == null || gridPositionKey(position, collectionType) === position
}
