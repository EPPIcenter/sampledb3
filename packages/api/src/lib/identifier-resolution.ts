import type { Database } from '../db/client'
import {
  study,
  studySubject,
  specimenType,
  micronixTube,
  micronixPlate,
  cryovialTube,
  cryovialBox,
  paper,
  sheet,
} from '../db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { ValidationError } from './error-handler'
import type { DatabaseOrTransaction } from './db-types'
import { chunkArray, SQL_IN_CHUNK_SIZE } from './sql-helpers'

/**
 * Resolve study short code to study ID
 */
export async function resolveStudyByShortCode(database: Database, shortCode: string): Promise<number | null> {
  return (await resolveStudyRecordByShortCode(database, shortCode))?.id ?? null
}

/** Resolve a study short code to the Study record, or undefined when no Study has it. */
export async function resolveStudyRecordByShortCode(
  database: Database,
  shortCode: string,
): Promise<typeof study.$inferSelect | undefined> {
  return database.select().from(study).where(eq(study.shortCode, shortCode)).get()
}

/**
 * Resolve subject name and study to subject ID
 */
export async function resolveSubjectByNameAndStudy(
  database: Database,
  subjectName: string,
  studyId: number
): Promise<number | null> {
  const subjectRecord = await database
    .select({ id: studySubject.id })
    .from(studySubject)
    .where(and(
      eq(studySubject.studyId, studyId),
      eq(studySubject.name, subjectName)
    ) as any)
    .get()
  
  return subjectRecord?.id ?? null
}

/**
 * Resolve specimen type name to specimen type ID
 */
export async function resolveSpecimenTypeByName(database: Database, name: string): Promise<number | null> {
  const specimenTypeRecord = await database
    .select({ id: specimenType.id })
    .from(specimenType)
    .where(eq(specimenType.name, name))
    .get()
  
  return specimenTypeRecord?.id ?? null
}

/** A Container a barcode lookup matched. Paper matches on its sublabel. */
export interface BarcodeMatch {
  containerId: number
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper'
  /** The stored barcode (or sublabel), which may differ in case or whitespace under `ignoreCase`. */
  barcode: string
  currentCollectionId: number
  currentCollectionName: string | null
  currentCollectionType: 'micronix_plate' | 'cryovial_box' | 'sheet'
  currentPosition: string | null
}

export interface FindContainersByBarcodeOptions {
  /** Compare trimmed and case-folded, as tube barcode uniqueness does. Default: exact match. */
  ignoreCase?: boolean
  /** Match micronix and cryovial tube barcodes only, not Paper sublabels. */
  tubesOnly?: boolean
}

/**
 * Every Container whose barcode (or Paper sublabel) is `barcode`, ordered by Container id.
 * Barcodes aren't unique across tube types, and cryovial barcodes aren't unique at all, so
 * a caller that needs one Container must handle several matches, for example with
 * `requireSingleBarcodeMatch`.
 */
export async function findContainersByBarcode(
  database: DatabaseOrTransaction,
  barcode: string,
  options: FindContainersByBarcodeOptions = {},
): Promise<BarcodeMatch[]> {
  const matches = (column: SQLiteColumn) =>
    options.ignoreCase ? sql`lower(trim(${column})) = lower(${barcode.trim()})` : eq(column, barcode)

  const micronix = await database
    .select({
      containerId: micronixTube.id,
      barcode: micronixTube.barcode,
      currentCollectionId: micronixTube.collectionId,
      currentCollectionName: micronixPlate.name,
      currentPosition: micronixTube.position,
    })
    .from(micronixTube)
    .leftJoin(micronixPlate, eq(micronixPlate.id, micronixTube.collectionId))
    .where(matches(micronixTube.barcode))
  const cryovial = await database
    .select({
      containerId: cryovialTube.id,
      barcode: cryovialTube.barcode,
      currentCollectionId: cryovialTube.collectionId,
      currentCollectionName: cryovialBox.name,
      currentPosition: cryovialTube.position,
    })
    .from(cryovialTube)
    .leftJoin(cryovialBox, eq(cryovialBox.id, cryovialTube.collectionId))
    .where(matches(cryovialTube.barcode))
  const papers = options.tubesOnly
    ? []
    : await database
        .select({
          containerId: paper.id,
          barcode: paper.sublabel,
          currentCollectionId: paper.sheetId,
          currentCollectionName: sheet.name,
        })
        .from(paper)
        .leftJoin(sheet, eq(sheet.id, paper.sheetId))
        .where(matches(paper.sublabel))

  const all: BarcodeMatch[] = [
    ...micronix.map((row) => ({ ...row, containerType: 'micronix_tube' as const, currentCollectionType: 'micronix_plate' as const })),
    ...cryovial.map((row) => ({
      ...row,
      barcode: row.barcode ?? '',
      containerType: 'cryovial_tube' as const,
      currentCollectionType: 'cryovial_box' as const,
    })),
    ...papers.map((row) => ({
      ...row,
      barcode: row.barcode ?? '',
      currentPosition: null,
      containerType: 'paper' as const,
      currentCollectionType: 'sheet' as const,
    })),
  ]
  return all.sort((a, b) => a.containerId - b.containerId)
}

/** How many candidates an ambiguous-barcode message names before summarising the rest. */
const LISTED_CANDIDATES = 10

function describeBarcodeMatch(match: BarcodeMatch): string {
  const place = [match.currentCollectionName, match.currentPosition].filter(Boolean).join(' ')
  return `container ${match.containerId} (${match.containerType}${place ? ` in ${place}` : ''})`
}

/**
 * A barcode lookup matched more than one Container and won't guess between them. `details`
 * lists every candidate; the message names the first few.
 */
export class AmbiguousBarcodeError extends ValidationError {
  constructor(
    readonly barcode: string,
    readonly candidates: BarcodeMatch[],
  ) {
    const listed = candidates.slice(0, LISTED_CANDIDATES).map(describeBarcodeMatch).join(', ')
    const more = candidates.length > LISTED_CANDIDATES ? `, and ${candidates.length - LISTED_CANDIDATES} more` : ''
    super(
      `Ambiguous barcode '${barcode}': it matches ${candidates.length} containers (${listed}${more}). ` +
        'Identify the container by its id or position instead.',
      { code: 'AMBIGUOUS_BARCODE', barcode, candidates },
    )
    this.name = 'AmbiguousBarcodeError'
  }
}

/** The one Container `barcode` names, or null when none does. Throws `AmbiguousBarcodeError` for several. */
export async function resolveContainerByBarcode(
  database: DatabaseOrTransaction,
  barcode: string,
): Promise<BarcodeMatch | null> {
  const matches = await findContainersByBarcode(database, barcode)
  if (matches.length > 1) throw new AmbiguousBarcodeError(barcode, matches)
  return matches[0] ?? null
}

/**
 * Tubes (micronix or cryovial) whose barcode equals `barcode` ignoring case and surrounding
 * whitespace, other than `exceptContainerId`. A new or changed tube barcode must match none.
 */
export async function findTubesUsingBarcode(
  database: DatabaseOrTransaction,
  barcode: string,
  exceptContainerId?: number,
): Promise<BarcodeMatch[]> {
  const matches = await findContainersByBarcode(database, barcode, { ignoreCase: true, tubesOnly: true })
  return matches.filter((match) => match.containerId !== exceptContainerId)
}

/**
 * Batch resolve study short codes to study IDs
 */
export async function resolveStudiesByShortCodes(
  database: Database,
  shortCodes: string[]
): Promise<Map<string, number>> {
  const uniqueCodes = [...new Set(shortCodes)]
  if (uniqueCodes.length === 0) return new Map()
  
  const result = new Map<string, number>()
  for (const code of uniqueCodes) {
    const id = await resolveStudyByShortCode(database, code)
    if (id) result.set(code, id)
  }
  
  return result
}

/**
 * Batch resolve specimen type names to IDs
 */
export async function resolveSpecimenTypesByNames(
  database: Database,
  names: string[]
): Promise<Map<string, number>> {
  const uniqueNames = [...new Set(names)]
  if (uniqueNames.length === 0) return new Map()
  
  const result = new Map<string, number>()
  for (const name of uniqueNames) {
    const id = await resolveSpecimenTypeByName(database, name)
    if (id) result.set(name, id)
  }
  
  return result
}

/**
 * Batch resolve subject names and study IDs to subject IDs
 */
export async function resolveSubjectsByNameAndStudy(
  database: Database,
  entries: Array<{ subjectName: string; studyId: number }>
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  for (const entry of entries) {
    const key = `${entry.studyId}:${entry.subjectName}`
    const subjectId = await resolveSubjectByNameAndStudy(database, entry.subjectName, entry.studyId)
    if (subjectId) {
      result.set(key, subjectId)
    }
  }
  
  return result
}

/**
 * Batch resolve subject names to IDs for a single study, a chunk of names at a time so no
 * IN list grows with the upload.
 */
export async function resolveSubjectNamesByStudy(
  database: Database,
  subjectNames: string[],
  studyId: number
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  for (const names of chunkArray([...new Set(subjectNames)], SQL_IN_CHUNK_SIZE)) {
    const subjects = await database
      .select({ id: studySubject.id, name: studySubject.name })
      .from(studySubject)
      .where(and(eq(studySubject.studyId, studyId), inArray(studySubject.name, names)))
    for (const subject of subjects) {
      result.set(subject.name, subject.id)
    }
  }
  return result
}

/**
 * Batch resolve subjects grouped by study
 * Returns a map of studyId -> Map<subjectName, subjectId>
 */
export async function resolveSubjectsByStudyGrouped(
  database: Database,
  entries: Array<{ studyId: number; subjectName: string }>
): Promise<Map<number, Map<string, number>>> {
  const result = new Map<number, Map<string, number>>()
  
  // Group entries by study
  const byStudy = new Map<number, string[]>()
  for (const entry of entries) {
    if (!byStudy.has(entry.studyId)) {
      byStudy.set(entry.studyId, [])
    }
    byStudy.get(entry.studyId)!.push(entry.subjectName)
  }
  
  // Resolve subjects for each study
  for (const [studyId, subjectNames] of byStudy.entries()) {
    const subjectMap = await resolveSubjectNamesByStudy(database, subjectNames, studyId)
    result.set(studyId, subjectMap)
  }
  
  return result
}
