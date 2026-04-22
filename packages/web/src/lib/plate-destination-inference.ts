import type { ScannerConfiguration } from './api'
import { extractPlateStemFromFilename, findPlateCandidatesFromStem, type PlateCandidate } from './plate-filename-match'

export interface PlateInferenceErrors {
  row: number
  error: string
}

function isColumnPlateSource(config: ScannerConfiguration): boolean {
  return config.plateNameSource === 'column'
}

/**
 * Infer destination micronix plate from filename or from a repeated column in the CSV.
 */
export function inferDestinationPlateForScan(
  filename: string,
  csvRows: Array<Record<string, string>>,
  config: ScannerConfiguration,
  plates: Array<{ id: number; name: string }>
): {
  inferredPlateName: string | null
  inferredMatches: PlateCandidate[]
  selectedPlateName: string | null
  plateInferenceErrors: PlateInferenceErrors[]
} {
  const plateInferenceErrors: PlateInferenceErrors[] = []

  let stem = ''
  if (isColumnPlateSource(config)) {
    const col = config.plateNameColumn?.trim() ?? ''
    if (!col) {
      plateInferenceErrors.push({
        row: 0,
        error: 'Scanner configuration uses plate column mode but no plate name column is set. Fix the configuration in Settings.',
      })
      return {
        inferredPlateName: null,
        inferredMatches: [],
        selectedPlateName: null,
        plateInferenceErrors,
      }
    }

    if (csvRows.length === 0) {
      plateInferenceErrors.push({
        row: 0,
        error: `No data rows to read plate name from column "${col}".`,
      })
      return {
        inferredPlateName: null,
        inferredMatches: [],
        selectedPlateName: null,
        plateInferenceErrors,
      }
    }

    const unique = new Set<string>()
    for (const row of csvRows) {
      const v = (row[col] ?? '').trim()
      if (v) unique.add(v)
    }

    if (unique.size === 0) {
      plateInferenceErrors.push({
        row: 0,
        error: `No non-empty values in plate name column "${col}". Check the column header matches your CSV.`,
      })
      return {
        inferredPlateName: null,
        inferredMatches: [],
        selectedPlateName: null,
        plateInferenceErrors,
      }
    }

    if (unique.size > 1) {
      const list = [...unique].sort().join(', ')
      plateInferenceErrors.push({
        row: 0,
        error: `Inconsistent plate names in column "${col}": ${list}. Each file must target one plate.`,
      })
      return {
        inferredPlateName: null,
        inferredMatches: [],
        selectedPlateName: null,
        plateInferenceErrors,
      }
    }

    stem = [...unique][0]
  } else {
    stem = extractPlateStemFromFilename(filename)
  }

  const candidates = findPlateCandidatesFromStem(stem, plates)

  let inferredPlateName: string | null = null
  let selectedPlateName: string | null = null

  const exactOnly = candidates.filter((c) => c.matchType === 'exact')

  // One exact name match wins even if other plates also "contain" the stem (e.g. PLATE-A vs PLATE-A-BACKUP).
  if (exactOnly.length === 1) {
    inferredPlateName = exactOnly[0].name
    selectedPlateName = exactOnly[0].name
  } else if (candidates.length === 1) {
    inferredPlateName = candidates[0].name
    selectedPlateName = candidates[0].name
  } else if (candidates.length > 1 || stem) {
    inferredPlateName = stem || null
  }

  return {
    inferredPlateName,
    inferredMatches: candidates,
    selectedPlateName,
    plateInferenceErrors,
  }
}

/** One-line summary for config list cards. */
export function plateNameSourceSummary(config: ScannerConfiguration): string {
  if (config.plateNameSource === 'column' && config.plateNameColumn?.trim()) {
    return `Plate: column "${config.plateNameColumn.trim()}"`
  }
  return 'Plate: filename'
}
