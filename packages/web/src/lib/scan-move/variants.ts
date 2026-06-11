import { inferDestinationPlateForScan } from '../plate-destination-inference'
import { parseScannerPlateCsv, validateScannerPlateCsv } from '../scanner-plate-csv'
import { parseBuiltinMoveCsv } from './ingest'
import type { ScanMoveIdentifier, ScanMoveInference, ScanMoveVariant } from './types'

/**
 * Built-in cryovial move CSV spec (ADR 0008): fixed columns, not a
 * lab-configurable scanner configuration.
 */
export const CRYOVIAL_MOVE_CSV_SPEC = {
  requiredColumns: ['source_collection_name', 'source_position', 'target_position'],
  skipRows: 0,
} as const

function positionKey(sourceCollectionName: string, sourcePosition: string): string {
  return `${sourceCollectionName}:${sourcePosition}`
}

export const micronixScanMoveVariant: ScanMoveVariant = {
  id: 'micronix',
  collectionType: 'micronix_plate',
  destinationNoun: 'plate',
  wrongCollectionTypeError: 'Some containers are not from micronix plates',
  capabilities: { createDestinations: true, relocationValidation: true },

  parseAndValidate(text, ctx) {
    if (!ctx.scannerConfig) {
      return {
        csvRows: [],
        errors: [{ row: 0, error: 'Select a scanner configuration before uploading files' }],
      }
    }
    const csvRows = parseScannerPlateCsv(text, ctx.scannerConfig)
    const validation = validateScannerPlateCsv(csvRows, ctx.scannerConfig)
    return { csvRows, errors: validation.errors }
  },

  inferDestination(filename, csvRows, ctx): ScanMoveInference {
    if (!ctx.scannerConfig) {
      return {
        inferredDestinationName: null,
        inferredMatches: [],
        selectedDestinationName: null,
        inferenceErrors: [],
      }
    }
    const inference = inferDestinationPlateForScan(filename, csvRows, ctx.scannerConfig, ctx.collections)
    return {
      inferredDestinationName: inference.inferredPlateName,
      inferredMatches: inference.inferredMatches,
      selectedDestinationName: inference.selectedPlateName,
      inferenceErrors: inference.plateInferenceErrors.map((e) => ({ ...e, kind: 'inference' as const })),
    }
  },

  identifierFromRow(row): ScanMoveIdentifier | null {
    const barcode = (row.container_barcode ?? '').trim()
    if (barcode === '') return null // empty well; no move for this row
    return { type: 'barcode', barcode }
  },

  identifierKey(identifier) {
    return identifier.type === 'barcode'
      ? identifier.barcode
      : positionKey(identifier.sourceCollectionName, identifier.sourcePosition)
  },

  identifierKeyFromResponse(identifier) {
    if (typeof identifier === 'string') return identifier
    if (identifier && typeof identifier === 'object' && 'barcode' in identifier) {
      const barcode = (identifier as { barcode?: unknown }).barcode
      return typeof barcode === 'string' ? barcode : null
    }
    return null
  },
}

export const cryovialScanMoveVariant: ScanMoveVariant = {
  id: 'cryovial',
  collectionType: 'cryovial_box',
  destinationNoun: 'box',
  wrongCollectionTypeError: 'Some containers are not from cryovial boxes',
  capabilities: { createDestinations: true, relocationValidation: false },

  parseAndValidate(text) {
    return parseBuiltinMoveCsv(text, CRYOVIAL_MOVE_CSV_SPEC)
  },

  inferDestination(filename, _csvRows, ctx): ScanMoveInference {
    // Exact (case-insensitive) filename match only — no stem heuristics.
    const baseName = filename
      .replace(/^.*[/\\]/, '')
      .replace(/\.csv$/i, '')
      .trim()
    if (!baseName) {
      return {
        inferredDestinationName: null,
        inferredMatches: [],
        selectedDestinationName: null,
        inferenceErrors: [],
      }
    }
    const matches = ctx.collections.filter((c) => c.name.toLowerCase() === baseName.toLowerCase())
    // Mirror micronix: one exact match auto-selects it; no match auto-proposes
    // the stem as a new box (create-destinations step assigns its location).
    const selectedDestinationName =
      matches.length === 1 ? matches[0].name : matches.length === 0 ? baseName : null
    return {
      inferredDestinationName: matches.length === 1 ? matches[0].name : baseName,
      inferredMatches: matches.map((m) => ({ id: m.id, name: m.name, matchType: 'exact' as const })),
      selectedDestinationName,
      inferenceErrors: [],
    }
  },

  identifierFromRow(row): ScanMoveIdentifier {
    return {
      type: 'position',
      sourceCollectionName: (row.source_collection_name ?? '').trim(),
      sourcePosition: (row.source_position ?? '').trim(),
    }
  },

  identifierKey(identifier) {
    return identifier.type === 'position'
      ? positionKey(identifier.sourceCollectionName, identifier.sourcePosition)
      : identifier.barcode
  },

  identifierKeyFromResponse(identifier) {
    if (typeof identifier === 'string') return identifier
    if (
      identifier &&
      typeof identifier === 'object' &&
      'sourceCollectionName' in identifier &&
      'sourcePosition' in identifier
    ) {
      const id = identifier as { sourceCollectionName?: unknown; sourcePosition?: unknown }
      if (typeof id.sourceCollectionName === 'string' && typeof id.sourcePosition === 'string') {
        return positionKey(id.sourceCollectionName, id.sourcePosition)
      }
    }
    return null
  },
}
