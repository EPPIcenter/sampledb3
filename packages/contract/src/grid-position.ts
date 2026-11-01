/**
 * The Grid position rule: which wells or slots a plate or box has, and how a typed position
 * maps onto one. Every Container write that sets a Grid position (moves, Scan moves, bulk
 * import, Specimen registration, derivations) checks the position with `parseGridPosition`.
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

const POSITION_PATTERN = /^([A-Za-z])(\d{1,2})$/

/** The range of a Collection type's Grid positions, as in "A01–H12". */
export function gridPositionRange(collectionType: GridCollectionType): string {
  const { rows, columns } = GRID_GEOMETRY[collectionType]
  return `A01–${formatGridPosition(rows - 1, columns)}`
}

function formatGridPosition(rowIndex: number, column: number): string {
  return `${String.fromCharCode(65 + rowIndex)}${String(column).padStart(2, '0')}`
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

  const rowIndex = match[1]!.toUpperCase().charCodeAt(0) - 65
  const column = parseInt(match[2]!, 10)
  const { rows, columns } = GRID_GEOMETRY[collectionType]
  if (rowIndex >= rows || column < 1 || column > columns) {
    return { ok: false, error: `Position "${value}" is outside a ${label} (${range})` }
  }
  return { ok: true, position: formatGridPosition(rowIndex, column) }
}
