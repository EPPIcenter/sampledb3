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
import { getScannerConfigurationById } from './settings'
import { parsePlateCSV, normalizeWellPosition } from './plate-csv'

export type WellValidationStatus = 'match' | 'mismatch' | 'missing_in_scan' | 'extra_in_scan'

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
  totalExpected: number
  matched: number
  missingInScan: number
  extraInScan: number
  mismatch: number
  exhaustedCount: number
  taggedCount: number
}

export interface ValidateScanResult {
  plate: { id: number; name: string }
  summary: ValidateScanSummary
  wells: WellValidationResult[]
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

  const expectedByPosition = new Map<string, ExpectedWell & { position: string }>()

  for (const t of tubes) {
    const pos = t.position ? normalizeWellPosition(t.position) : null
    if (pos) expectedByPosition.set(pos, { position: pos, barcode: t.barcode, remainingQuantity: null, tags: [] })
  }
  for (const w of wells) {
    const pos = w.position ? normalizeWellPosition(w.position) : null
    if (pos) expectedByPosition.set(pos, { position: pos, barcode: null, remainingQuantity: null, tags: [] })
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

    for (const t of tubes) {
      const entry = expectedByPosition.get(normalizeWellPosition(t.position ?? '') ?? '')
      if (entry) {
        entry.remainingQuantity = remainingByContainerId.get(t.id) ?? null
        entry.tags = tagsByContainerId.get(t.id) ?? []
      }
    }
    for (const w of wells) {
      const entry = expectedByPosition.get(normalizeWellPosition(w.position ?? '') ?? '')
      if (entry) {
        entry.remainingQuantity = remainingByContainerId.get(w.id) ?? null
        entry.tags = tagsByContainerId.get(w.id) ?? []
      }
    }
  }

  // Positions to report: all expected, plus scanned positions that have a barcode (empty scan rows with nothing in DB are skipped)
  const allPositions = new Set<string>(expectedByPosition.keys())
  for (const [pos, barcode] of scannedByPosition) {
    if ((barcode?.trim() ?? '') !== '') allPositions.add(pos)
    else if (expectedByPosition.has(pos)) allPositions.add(pos)
  }
  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  const sortedPositions = ROWS.flatMap((r) =>
    Array.from({ length: 12 }, (_, i) => `${r}${(i + 1).toString().padStart(2, '0')}`)
  ).filter((p) => allPositions.has(p))
  const rest = [...allPositions].filter((p) => !sortedPositions.includes(p)).sort()
  const positionOrder = [...sortedPositions, ...rest]

  let matched = 0
  let missingInScan = 0
  let extraInScan = 0
  let mismatch = 0
  let exhaustedCount = 0
  let taggedCount = 0

  const wellResults: WellValidationResult[] = []

  for (const position of positionOrder) {
    const expected = expectedByPosition.get(position)
    const scanBarcodeRaw = scannedByPosition.get(position)
    const scanPresent = scannedByPosition.has(position)
    const scanHasBarcode = scanPresent && (scanBarcodeRaw?.trim() ?? '') !== ''
    const scanBarcode = scanPresent ? (scanBarcodeRaw ?? null) : null
    const expectedBarcode = expected?.barcode ?? null
    const exhausted = expected != null && expected.remainingQuantity != null && expected.remainingQuantity <= 0
    const tagsList = expected?.tags ?? []
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
            (w.status === 'mismatch' || w.status === 'extra_in_scan') &&
            w.scanBarcode != null &&
            w.scanBarcode.trim() !== ''
        )
        .map((w) => w.scanBarcode!.trim())
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
      if (row.barcode != null) {
        originByBarcode.set(row.barcode, {
          plateId: row.plateId,
          plateName: row.plateName,
          position: row.position ?? '',
        })
      }
    }
  }
  for (const w of wellResults) {
    if (
      (w.status === 'mismatch' || w.status === 'extra_in_scan') &&
      w.scanBarcode != null &&
      w.scanBarcode.trim() !== ''
    ) {
      const origin = originByBarcode.get(w.scanBarcode.trim())
      if (origin) w.scanBarcodeOrigin = origin
    }
  }

  const totalExpected = expectedByPosition.size
  const summary: ValidateScanSummary = {
    totalExpected,
    matched,
    missingInScan,
    extraInScan,
    mismatch,
    exhaustedCount,
    taggedCount,
  }

  return {
    plate: { id: plate.id, name: plate.name },
    summary,
    wells: wellResults,
  }
}
