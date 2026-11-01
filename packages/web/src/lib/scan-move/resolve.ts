import { parseGridPosition, type GridCollectionType } from '@sampledb/contract'
import type {
  ScanMoveCollectionRef,
  ScanMoveEvent,
  ScanMoveFile,
  ScanMoveGateway,
  ScanMoveIdentifier,
  ScanMoveResolveOutcome,
  ScanMoveResolveResponseEntry,
  ScanMoveValidationError,
  ScanMoveVariant,
} from './types'

export interface ScanMoveResolveEntry {
  identifier: ScanMoveIdentifier
  key: string
  fileIndex: number
  /** 0-based CSV data row. */
  rowIndex: number
}

/** Flatten all moving rows across files into resolve identifiers. */
export function buildResolveIdentifiers(
  files: ScanMoveFile[],
  variant: ScanMoveVariant,
): ScanMoveResolveEntry[] {
  const entries: ScanMoveResolveEntry[] = []
  files.forEach((file, fileIndex) => {
    file.csvRows.forEach((row, rowIndex) => {
      const identifier = variant.identifierFromRow(row)
      if (identifier === null) return
      entries.push({ identifier, key: variant.identifierKey(identifier), fileIndex, rowIndex })
    })
  })
  return entries
}

/**
 * Group resolve responses back onto files and detect containers that are
 * not in a collection of the variant's type.
 */
export function groupResolveResults(
  entries: ScanMoveResolveEntry[],
  responseContainers: ScanMoveResolveResponseEntry[],
  files: ScanMoveFile[],
  variant: ScanMoveVariant,
): ScanMoveResolveOutcome[] {
  const entryByKey = new Map<string, ScanMoveResolveEntry>()
  for (const entry of entries) {
    if (!entryByKey.has(entry.key)) entryByKey.set(entry.key, entry)
  }

  const outcomes: ScanMoveResolveOutcome[] = files.map((_, fileIndex) => ({
    fileIndex,
    resolvedContainers: [],
    unresolvedContainers: [],
    errors: [],
  }))

  const resolvedKeys = new Set<string>()
  const wrongTypeFileIndexes = new Set<number>()

  for (const response of responseContainers) {
    const key = variant.identifierKeyFromResponse(response.identifier)
    if (key === null) continue
    const entry = entryByKey.get(key)
    if (!entry) continue
    if (!response.container) {
      // The server found several Containers for this identifier and won't pick one.
      if (response.error !== undefined) {
        resolvedKeys.add(key)
        outcomes[entry.fileIndex].errors.push({ row: entry.rowIndex + 1, error: response.error })
      }
      continue
    }
    resolvedKeys.add(key)
    outcomes[entry.fileIndex].resolvedContainers.push({
      identifierKey: key,
      container: response.container,
    })
    if (response.container.currentCollectionType !== variant.collectionType) {
      wrongTypeFileIndexes.add(entry.fileIndex)
    }
  }

  for (const entry of entries) {
    if (resolvedKeys.has(entry.key)) continue
    const csvRow = files[entry.fileIndex].csvRows[entry.rowIndex]
    outcomes[entry.fileIndex].unresolvedContainers.push({
      identifierKey: entry.key,
      rowIndex: entry.rowIndex + 1,
      targetPosition: csvRow.target_position || '',
    })
  }

  for (const fileIndex of wrongTypeFileIndexes) {
    outcomes[fileIndex].errors.push({ row: 0, error: variant.wrongCollectionTypeError, kind: 'resolution' })
  }

  return outcomes
}

type DestinationWells = Record<string, { type: string; barcode?: string | null }>

/**
 * Stored-form (`A01`) key for a scanned or stored position, or null when it
 * isn't a Grid position. Scanners write `A1` or `a01`; wells are keyed `A01`.
 */
function gridKey(position: string, collectionType: GridCollectionType): string | null {
  const parsed = parseGridPosition(position, collectionType)
  return parsed.ok ? parsed.position : null
}

/**
 * Relocation validation (micronix capability): a position that is empty in
 * the upload but currently holds a tube is only valid when that tube is
 * relocated elsewhere in the same scan move. Positions on both sides are
 * compared in stored form by the Grid position rule.
 */
export function validateRelocations(
  files: ScanMoveFile[],
  wellsByDestinationName: Map<string, DestinationWells>,
  variant: Pick<ScanMoveVariant, 'destinationNoun' | 'collectionType'>,
): Map<number, ScanMoveValidationError[]> {
  const { destinationNoun, collectionType } = variant
  const errorsByFile = new Map<number, ScanMoveValidationError[]>()
  const pushError = (fileIndex: number, error: ScanMoveValidationError) => {
    if (!errorsByFile.has(fileIndex)) errorsByFile.set(fileIndex, [])
    errorsByFile.get(fileIndex)!.push(error)
  }

  const destinationNames = [
    ...new Set(files.map((f) => f.selectedDestinationName).filter((n): n is string => Boolean(n))),
  ]

  for (const destinationName of destinationNames) {
    const wells = wellsByDestinationName.get(destinationName)
    if (!wells) {
      const error: ScanMoveValidationError = {
        row: 0,
        error: `Destination ${destinationNoun} "${destinationName}" could not be found. Create it or select an existing ${destinationNoun}.`,
        kind: 'destination',
      }
      files.forEach((f, fileIndex) => {
        if (f.selectedDestinationName === destinationName) pushError(fileIndex, error)
      })
      continue
    }

    const wellsByPosition = new Map<string, DestinationWells[string]>()
    for (const [position, well] of Object.entries(wells)) {
      wellsByPosition.set(gridKey(position, collectionType) ?? position, well)
    }

    const positionToBarcode = new Map<string, string>()
    const positionToEmpty = new Map<string, { fileIndex: number; row: number }>()
    files.forEach((file, fileIndex) => {
      if (file.selectedDestinationName !== destinationName) return
      file.csvRows.forEach((row, rowIndex) => {
        const raw = row.target_position.trim()
        const barcode = row.container_barcode.trim()
        if (raw === '') return
        // A position off the grid is reported at upload; compare it verbatim here.
        const position = gridKey(raw, collectionType) ?? raw
        if (barcode !== '') {
          positionToBarcode.set(position, barcode)
        } else if (!positionToEmpty.has(position)) {
          positionToEmpty.set(position, { fileIndex, row: rowIndex + 1 })
        }
      })
    })

    const barcodesRelocatedInMove = new Set(positionToBarcode.values())
    for (const [position, origin] of positionToEmpty) {
      if (positionToBarcode.has(position)) continue
      const well = wellsByPosition.get(position)
      if (well?.type === 'micronix_tube' && well.barcode && !barcodesRelocatedInMove.has(well.barcode)) {
        pushError(origin.fileIndex, {
          row: origin.row,
          error: `Position ${position} on ${destinationNoun} "${destinationName}" is empty in your upload but tube ${well.barcode} is currently there and is not relocated in this move.`,
          kind: 'relocation',
        })
      }
    }
  }

  return errorsByFile
}

/**
 * Resolve effect: batch-resolve all identifiers, group per file, run
 * capability validations, and report whether the workflow advanced.
 */
export async function resolveScanMove(
  variant: ScanMoveVariant,
  files: ScanMoveFile[],
  options: { gateway: ScanMoveGateway; collections: ScanMoveCollectionRef[] },
): Promise<ScanMoveEvent> {
  const { gateway, collections } = options
  try {
    const entries = buildResolveIdentifiers(files, variant)
    const response = await gateway.resolveContainers(entries.map((e) => e.identifier))
    const outcomes = groupResolveResults(entries, response.containers, files, variant)

    if (variant.capabilities.relocationValidation) {
      const destinationNames = [
        ...new Set(
          files.map((f) => f.selectedDestinationName).filter((n): n is string => Boolean(n)),
        ),
      ]
      const wellsByDestinationName = new Map<string, DestinationWells>()
      for (const name of destinationNames) {
        const collection = collections.find((c) => c.name === name)
        if (collection === undefined) continue
        wellsByDestinationName.set(name, await gateway.getDestinationWells(collection.id))
      }
      const relocationErrors = validateRelocations(files, wellsByDestinationName, variant)
      for (const [fileIndex, errors] of relocationErrors) {
        outcomes[fileIndex].errors.push(...errors)
      }
    }

    const advanced = outcomes.every((o) => o.errors.length === 0)
    return { type: 'RESOLVE_COMPLETED', outcomes, advanced }
  } catch (err) {
    return { type: 'RESOLVE_FAILED', message: resolveErrorMessage(err) }
  }
}

function resolveErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data
    if (data?.error) return data.error
  }
  if (err instanceof Error && err.message) return err.message
  return 'Failed to resolve containers'
}
