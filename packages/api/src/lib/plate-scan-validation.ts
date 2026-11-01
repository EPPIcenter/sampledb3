import type { Database } from '../db/client'
import {
  micronixPlate,
  micronixTube,
  staticWell,
  storageContainer,
  storageContainerTag,
  tag,
} from '../db/schema'
import { eq, inArray } from 'drizzle-orm'
import { gridCellKeys, gridPositionKey } from '@sampledb/contract'
import { getScannerConfigurationById } from './settings'
import { parsePlateCSV, normalizeWellPosition } from './plate-csv'

/**
 * `unplaced_in_scan`: the scanned tube belongs to this plate but has no grid position
 * (or a stored position that is not a plate cell), so it is expected, not extra.
 */
export type WellValidationStatus = 'match' | 'mismatch' | 'missing_in_scan' | 'extra_in_scan' | 'unplaced_in_scan'

/** Where the scanned barcode is registered (plate + position), when it differs from expected or is extra. */
export interface ScanBarcodeOrigin {
  plateId: number
  plateName: string
  position: string
}

export interface WellValidationResult {
  position: string
  scanBarcode: string | null
  expectedBarcode: string | null
  status: WellValidationStatus
  exhausted: boolean
  tags: string[]
  /** When status is mismatch or extra_in_scan and the scanned barcode exists in DB, where it is registered. */
  scanBarcodeOrigin: ScanBarcodeOrigin | null
}

export interface ValidateScanSummary {
  /** Every tube in the plate, placed or unplaced, plus placed static wells. */
  totalExpected: number
  matched: number
  /** Placed wells empty in the scan, plus unplaced tubes whose barcode is nowhere in the scan. */
  missingInScan: number
  extraInScan: number
  /** Unplaced tubes of this plate whose barcode the scan found at some position. */
  unplacedInScan: number
  mismatch: number
  exhaustedCount: number
  taggedCount: number
}

/** A tube in the plate with no grid position, or a stored position that is not a plate cell. */
export interface UnplacedTubeResult {
  barcode: string
  /** The stored position as recorded, or null when none is recorded. */
  storedPosition: string | null
  /** Where the scan found this barcode, or null when it is not in the scan. */
  scannedPosition: string | null
}

export interface ValidateScanResult {
  plate: { id: number; name: string }
  summary: ValidateScanSummary
  wells: WellValidationResult[]
  unplaced: UnplacedTubeResult[]
}

export interface InferPlateResult {
  plate: { id: number; name: string }
}

/** Per-plate summary when inference cannot determine a single plate. */
export interface InferenceReportPlateBreakdownEntry {
  plateId: number
  plateName: string
  tubeCount: number
  inExpectedPositionCount: number
}

/** Detailed report when plate cannot be inferred (unknown barcodes and/or multiple plates). */
export interface InferenceReport {
  unknownBarcodes: string[]
  plateBreakdown: InferenceReportPlateBreakdownEntry[]
}

export type InferPlateOrReportResult =
  | { plate: { id: number; name: string } }
  | { inferenceReport: InferenceReport }

/** Infer which plate the scanned barcodes belong to. All non-empty barcodes must exist and belong to the same plate. */
export async function inferPlateFromScan(
  database: Database,
  params: { csvText: string; scannerConfigurationId: string }
): Promise<InferPlateResult> {
  const config = await getScannerConfigurationById(database, params.scannerConfigurationId)
  if (!config) {
    throw new Error('Scanner configuration not found')
  }

  const parsed = parsePlateCSV(params.csvText, config)
  const barcodes = new Set<string>()
  for (const row of parsed) {
    const b = row.barcode.trim()
    if (b !== '') barcodes.add(b)
  }

  if (barcodes.size === 0) {
    throw new Error('Cannot infer plate: scan has no barcodes')
  }

  const barcodeList = [...barcodes]
  const rows = await database
    .select({
      barcode: micronixTube.barcode,
      plateId: micronixPlate.id,
      plateName: micronixPlate.name,
    })
    .from(micronixTube)
    .innerJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
    .where(inArray(micronixTube.barcode, barcodeList))

  const foundBarcodes = new Set<string>()
  const platesByKey = new Map<string, { id: number; name: string }>()
  for (const row of rows) {
    foundBarcodes.add(row.barcode)
    platesByKey.set(`${row.plateId}`, { id: row.plateId, name: row.plateName })
  }

  const unknown = barcodeList.filter((b) => !foundBarcodes.has(b))
  if (unknown.length > 0) {
    throw new Error(`Unknown barcode(s): ${unknown.join(', ')}`)
  }

  const plates = [...platesByKey.values()]
  if (plates.length > 1) {
    throw new Error(`Tubes from multiple plates: ${plates.map((p) => p.name).join(', ')}`)
  }
  const plate = plates[0]!
  return { plate }
}

/**
 * Infer plate from scan or return a detailed inference report when that is not possible
 * (no barcodes → throws; unknown barcodes and/or multiple plates → returns inferenceReport).
 */
export async function inferPlateOrGetReport(
  database: Database,
  params: { csvText: string; scannerConfigurationId: string }
): Promise<InferPlateOrReportResult> {
  const config = await getScannerConfigurationById(database, params.scannerConfigurationId)
  if (!config) {
    throw new Error('Scanner configuration not found')
  }

  const parsed = parsePlateCSV(params.csvText, config)
  const barcodes = new Set<string>()
  const scannedByPosition = new Map<string, string>()
  for (const row of parsed) {
    const pos = normalizeWellPosition(row.wellPosition)
    if (pos) scannedByPosition.set(pos, row.barcode)
    const b = row.barcode.trim()
    if (b !== '') barcodes.add(b)
  }

  if (barcodes.size === 0) {
    throw new Error('Cannot infer plate: scan has no barcodes')
  }

  const barcodeList = [...barcodes]
  const rows = await database
    .select({
      barcode: micronixTube.barcode,
      position: micronixTube.position,
      plateId: micronixPlate.id,
      plateName: micronixPlate.name,
    })
    .from(micronixTube)
    .innerJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
    .where(inArray(micronixTube.barcode, barcodeList))

  const foundBarcodes = new Set<string>()
  const byPlateId = new Map<
    number,
    { plateName: string; entries: { barcode: string; position: string }[] }
  >()
  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- barcode column nullable at runtime
    if (row.barcode == null) continue
    foundBarcodes.add(row.barcode)
    const pos = (row.position ?? '').trim()
    const existing = byPlateId.get(row.plateId)
    if (existing) {
      existing.entries.push({ barcode: row.barcode, position: pos })
    } else {
      byPlateId.set(row.plateId, {
        plateName: row.plateName,
        entries: [{ barcode: row.barcode, position: pos }],
      })
    }
  }

  const unknownBarcodes = barcodeList.filter((b) => !foundBarcodes.has(b))
  const plateBreakdown: InferenceReportPlateBreakdownEntry[] = []
  for (const [plateId, { plateName, entries }] of byPlateId) {
    const tubeCount = entries.length
    const inExpectedPositionCount = entries.filter((e) => {
      const norm = normalizeWellPosition(e.position)
      return norm && (scannedByPosition.get(norm) ?? '').trim() === e.barcode
    }).length
    plateBreakdown.push({
      plateId,
      plateName,
      tubeCount,
      inExpectedPositionCount,
    })
  }

  const singlePlateNoUnknown =
    unknownBarcodes.length === 0 && plateBreakdown.length === 1
  if (singlePlateNoUnknown) {
    const plate = plateBreakdown[0]!
    return { plate: { id: plate.plateId, name: plate.plateName } }
  }

  return {
    inferenceReport: {
      unknownBarcodes,
      plateBreakdown,
    },
  }
}

interface ExpectedWell {
  barcode: string | null
  remainingQuantity: number | null
  tags: string[]
}

export async function validatePlateScan(
  database: Database,
  params: { csvText: string; plateId: number; scannerConfigurationId: string }
): Promise<ValidateScanResult> {
  const config = await getScannerConfigurationById(database, params.scannerConfigurationId)
  if (!config) {
    throw new Error('Scanner configuration not found')
  }

  const plate = await database
    .select({ id: micronixPlate.id, name: micronixPlate.name })
    .from(micronixPlate)
    .where(eq(micronixPlate.id, params.plateId))
    .get()

  if (!plate) {
    throw new Error('Plate not found')
  }

  const parsed = parsePlateCSV(params.csvText, config)
  const scannedByPosition = new Map<string, string>()
  for (const row of parsed) {
    const pos = normalizeWellPosition(row.wellPosition)
    if (pos) scannedByPosition.set(pos, row.barcode)
  }

  const [tubes, wells] = await Promise.all([
    database.select().from(micronixTube).where(eq(micronixTube.collectionId, params.plateId)),
    database.select().from(staticWell).where(eq(staticWell.collectionId, params.plateId)),
  ])

  const containerIds = [
    ...tubes.map((t) => t.id),
    ...wells.map((w) => w.id),
  ]

  const expectedByPosition = new Map<string, ExpectedWell & { position: string; containerId: number }>()
  // Tubes whose position is missing or not a plate cell (or a cell another tube already holds).
  const unplacedByBarcode = new Map<string, Omit<ExpectedWell, 'barcode'> & { barcode: string; storedPosition: string | null; containerId: number }>()

  for (const t of tubes) {
    const pos = gridPositionKey(t.position, 'micronix_plate')
    if (pos != null && !expectedByPosition.has(pos)) {
      expectedByPosition.set(pos, { position: pos, containerId: t.id, barcode: t.barcode, remainingQuantity: null, tags: [] })
    } else {
      unplacedByBarcode.set(t.barcode, {
        storedPosition: t.position,
        containerId: t.id,
        barcode: t.barcode,
        remainingQuantity: null,
        tags: [],
      })
    }
  }
  for (const w of wells) {
    const pos = gridPositionKey(w.position, 'micronix_plate')
    if (pos != null && !expectedByPosition.has(pos)) {
      expectedByPosition.set(pos, { position: pos, containerId: w.id, barcode: null, remainingQuantity: null, tags: [] })
    }
  }

  if (containerIds.length > 0) {
    const [containers, tagRows] = await Promise.all([
      database.select({ id: storageContainer.id, remainingQuantity: storageContainer.remainingQuantity }).from(storageContainer).where(inArray(storageContainer.id, containerIds)),
      database
        .select({ storageContainerId: storageContainerTag.storageContainerId, tagName: tag.name })
        .from(storageContainerTag)
        .innerJoin(tag, eq(storageContainerTag.tagId, tag.id))
        .where(inArray(storageContainerTag.storageContainerId, containerIds)),
    ])

    const remainingByContainerId = new Map(containers.map((c) => [c.id, c.remainingQuantity]))
    const tagsByContainerId = new Map<number, string[]>()
    for (const tr of tagRows) {
      const list = tagsByContainerId.get(tr.storageContainerId) ?? []
      list.push(tr.tagName)
      tagsByContainerId.set(tr.storageContainerId, list)
    }

    for (const entry of [...expectedByPosition.values(), ...unplacedByBarcode.values()]) {
      entry.remainingQuantity = remainingByContainerId.get(entry.containerId) ?? null
      entry.tags = tagsByContainerId.get(entry.containerId) ?? []
    }
  }

  const scannedPositionByUnplacedBarcode = new Map<string, string>()
  for (const [pos, barcode] of scannedByPosition) {
    const trimmed = barcode.trim()
    if (unplacedByBarcode.has(trimmed) && !scannedPositionByUnplacedBarcode.has(trimmed)) {
      scannedPositionByUnplacedBarcode.set(trimmed, pos)
    }
  }

  // Positions to report: all expected, plus scanned positions that have a barcode (empty scan rows with nothing in DB are skipped)
  const allPositions = new Set<string>(expectedByPosition.keys())
  for (const [pos, barcode] of scannedByPosition) {
    if (barcode.trim() !== '') allPositions.add(pos)
    else if (expectedByPosition.has(pos)) allPositions.add(pos)
  }
  const sortedPositions = gridCellKeys('micronix_plate').filter((p) => allPositions.has(p))
  const rest = [...allPositions].filter((p) => !sortedPositions.includes(p)).sort()
  const positionOrder = [...sortedPositions, ...rest]

  let matched = 0
  let missingInScan = 0
  let extraInScan = 0
  let unplacedInScan = 0
  let mismatch = 0
  let exhaustedCount = 0
  let taggedCount = 0

  const wellResults: WellValidationResult[] = []

  for (const position of positionOrder) {
    const expected = expectedByPosition.get(position)
    const scanBarcodeRaw = scannedByPosition.get(position)
    const scanPresent = scannedByPosition.has(position)
    const scanHasBarcode = scanPresent && (scanBarcodeRaw ?? '').trim() !== ''
    const scanBarcode = scanPresent ? (scanBarcodeRaw ?? null) : null
    const expectedBarcode = expected?.barcode ?? null
    const unplacedTube = !expected && scanHasBarcode ? unplacedByBarcode.get((scanBarcode ?? '').trim()) : undefined
    const described = expected ?? unplacedTube
    const exhausted = described != null && described.remainingQuantity != null && described.remainingQuantity <= 0
    const tagsList = described?.tags ?? []
    if (exhausted) exhaustedCount++
    if (tagsList.length > 0) taggedCount++

    let status: WellValidationStatus
    if (expected && scanHasBarcode) {
      if ((expectedBarcode ?? '') === (scanBarcode ?? '')) {
        status = 'match'
        matched++
      } else {
        status = 'mismatch'
        mismatch++
      }
    } else if (expected && (!scanPresent || !scanHasBarcode)) {
      status = 'missing_in_scan'
      missingInScan++
    } else if (unplacedTube) {
      status = 'unplaced_in_scan'
    } else {
      status = 'extra_in_scan'
      extraInScan++
    }

    wellResults.push({
      position,
      scanBarcode: scanPresent ? scanBarcode : null,
      expectedBarcode: expectedBarcode ?? null,
      status,
      exhausted,
      tags: tagsList,
      scanBarcodeOrigin: null, // filled below for mismatch/extra_in_scan
    })
  }

  // Look up where each mismatched/extra scanned barcode is registered (plate + position)
  const barcodesToLookup = [
    ...new Set(
      wellResults
        .filter(
          (w) =>
            (w.status === 'mismatch' || w.status === 'extra_in_scan' || w.status === 'unplaced_in_scan') &&
            w.scanBarcode != null &&
            w.scanBarcode.trim() !== ''
        )
        .map((w) => (w.scanBarcode ?? '').trim())
    ),
  ]
  const originByBarcode = new Map<string, ScanBarcodeOrigin>()
  if (barcodesToLookup.length > 0) {
    const rows = await database
      .select({
        barcode: micronixTube.barcode,
        position: micronixTube.position,
        plateId: micronixPlate.id,
        plateName: micronixPlate.name,
      })
      .from(micronixTube)
      .innerJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
      .where(inArray(micronixTube.barcode, barcodesToLookup))

    for (const row of rows) {
      const barcode = row.barcode
      if (barcode !== '') {
        originByBarcode.set(barcode, {
          plateId: row.plateId,
          plateName: row.plateName,
          position: row.position ?? '',
        })
      }
    }
  }
  for (const w of wellResults) {
    if (
      (w.status === 'mismatch' || w.status === 'extra_in_scan' || w.status === 'unplaced_in_scan') &&
      w.scanBarcode != null &&
      w.scanBarcode.trim() !== ''
    ) {
      const origin = originByBarcode.get(w.scanBarcode.trim())
      if (origin) w.scanBarcodeOrigin = origin
    }
  }

  const unplaced: UnplacedTubeResult[] = [...unplacedByBarcode.values()].map((t) => ({
    barcode: t.barcode,
    storedPosition: t.storedPosition,
    scannedPosition: scannedPositionByUnplacedBarcode.get(t.barcode) ?? null,
  }))
  for (const t of unplaced) {
    if (t.scannedPosition != null) unplacedInScan++
    else missingInScan++
  }

  const totalExpected = expectedByPosition.size + unplacedByBarcode.size
  const summary: ValidateScanSummary = {
    totalExpected,
    matched,
    missingInScan,
    extraInScan,
    unplacedInScan,
    mismatch,
    exhaustedCount,
    taggedCount,
  }

  return {
    plate: { id: plate.id, name: plate.name },
    summary,
    wells: wellResults,
    unplaced,
  }
}
