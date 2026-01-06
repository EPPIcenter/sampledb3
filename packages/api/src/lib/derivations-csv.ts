import { db } from '../db/client'
import {
  containerDerivation,
  cryovialBox,
  cryovialTube,
  micronixPlate,
  micronixTube,
  paper,
  specimen,
  specimenType,
  storageContainer,
  study,
  studySubject,
} from '../db/schema'
import { and, eq } from 'drizzle-orm'
import { createDerivation, type CreateDerivationInput } from './derivations'

export interface DerivationCsvRow {
  // Parent identification
  parent_container_id?: string
  parent_container_barcode?: string
  parent_container_type?: 'micronix_tube' | 'cryovial_tube' | 'paper'
  parent_box_barcode?: string
  parent_position?: string
  parent_study_short_code?: string
  parent_subject_name?: string
  parent_specimen_type_name?: string
  parent_collection_date?: string

  // Derivation data
  derivation_type: string
  specimen_type_name: string
  container_type: 'micronix_tube' | 'cryovial_tube' | 'paper'
  quantity?: string
  unit_symbol?: string
  quantity_used?: string
  reduce_parent_quantity?: string
  derivation_date?: string
  protocol?: string
  notes?: string
  collection_name?: string
  collection_barcode?: string
  container_barcode?: string
  position?: string
}

export interface DerivationCsvResultRow {
  index: number
  success: boolean
  error?: string
  warnings?: string[]
  derivationId?: number
  parentContainerId?: number
  childContainerId?: number
}

function parseBoolean(value?: string): boolean | undefined {
  if (value == null) return undefined
  const v = value.trim().toLowerCase()
  if (!v) return undefined
  return v === 'true' || v === '1' || v === 'yes' || v === 'y'
}

function parseNumber(value?: string): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

// Extremely small CSV parser: handles commas and quoted fields
export function parseCsv(text: string): DerivationCsvRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) return []

  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current)
    return result
  }

  const headers = parseLine(lines[0]).map(h => h.trim())
  const rows: DerivationCsvRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i])
    const row: any = {}
    headers.forEach((h, idx) => {
      row[h as keyof DerivationCsvRow] = cols[idx]?.trim()
    })
    rows.push(row as DerivationCsvRow)
  }

  return rows
}

async function resolveParentContainerId(row: DerivationCsvRow): Promise<number> {
  // 1. Explicit ID
  const explicitId = parseNumber(row.parent_container_id)
  if (explicitId) {
    const existing = await db
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .where(eq(storageContainer.id, explicitId))
      .get()
    if (!existing) {
      throw new Error(`Parent container id '${explicitId}' not found`)
    }
    return explicitId
  }

  // 2. Barcode across known subtypes
  if (row.parent_container_barcode) {
    const barcode = row.parent_container_barcode.trim()

    const micronix = await db
      .select({ id: micronixTube.id })
      .from(micronixTube)
      .where(eq(micronixTube.barcode, barcode))
      .get()
    if (micronix) return micronix.id

    const cryovial = await db
      .select({ id: cryovialTube.id })
      .from(cryovialTube)
      .where(eq(cryovialTube.barcode, barcode))
      .get()
    if (cryovial) return cryovial.id

    const paperRec = await db
      .select({ id: paper.id })
      .from(paper)
      .where(eq(paper.barcode, barcode))
      .get()
    if (paperRec) return paperRec.id

    throw new Error(`Parent container barcode '${barcode}' not found`)
  }

  const type = row.parent_container_type

  if (type === 'micronix_tube') {
    throw new Error('Micronix parent containers require parent_container_barcode or parent_container_id')
  }

  if (type === 'cryovial_tube') {
    if (!row.parent_box_barcode || !row.parent_position) {
      throw new Error('Cryovial parents require parent_box_barcode and parent_position')
    }
    const box = await db
      .select({ id: cryovialBox.id })
      .from(cryovialBox)
      .where(eq(cryovialBox.barcode, row.parent_box_barcode.trim()))
      .get()
    if (!box) {
      throw new Error(`Cryovial box barcode '${row.parent_box_barcode}' not found`)
    }
    const tube = await db
      .select({ id: cryovialTube.id })
      .from(cryovialTube)
      .where(and(
        eq(cryovialTube.collectionId, box.id),
        eq(cryovialTube.position, row.parent_position.trim()),
      ) as any)
      .get()
    if (!tube) {
      throw new Error(`Cryovial tube not found at position '${row.parent_position}' in box '${row.parent_box_barcode}'`)
    }
    return tube.id
  }

  if (type === 'paper') {
    if (!row.parent_study_short_code || !row.parent_subject_name || !row.parent_specimen_type_name) {
      throw new Error('Paper parents require parent_study_short_code, parent_subject_name, and parent_specimen_type_name')
    }

    const studyRec = await db
      .select({ id: study.id })
      .from(study)
      .where(eq(study.shortCode, row.parent_study_short_code.trim()))
      .get()
    if (!studyRec) {
      throw new Error(`Study short code '${row.parent_study_short_code}' not found`)
    }

    const subjectRec = await db
      .select({ id: studySubject.id })
      .from(studySubject)
      .where(and(
        eq(studySubject.studyId, studyRec.id),
        eq(studySubject.name, row.parent_subject_name.trim()),
      ) as any)
      .get()
    if (!subjectRec) {
      throw new Error(`Subject '${row.parent_subject_name}' not found in study '${row.parent_study_short_code}'`)
    }

    const typeRec = await db
      .select({ id: specimenType.id })
      .from(specimenType)
      .where(eq(specimenType.name, row.parent_specimen_type_name.trim()))
      .get()
    if (!typeRec) {
      throw new Error(`Specimen type '${row.parent_specimen_type_name}' not found`)
    }

    const where = and(
      eq(specimen.studySubjectId, subjectRec.id),
      eq(specimen.specimenTypeId, typeRec.id),
    ) as any

    const candidates = await db
      .select({ id: specimen.id })
      .from(specimen)
      .where(row.parent_collection_date
        ? and(where, eq(specimen.collectionDate, row.parent_collection_date.trim())) as any
        : where,
      )

    if (candidates.length === 0) {
      throw new Error('No matching parent specimen/paper container found for subject/specimen criteria')
    }
    if (candidates.length > 1) {
      throw new Error('Multiple candidate parent specimens found; add parent_collection_date or use a more specific identifier')
    }

    const specId = candidates[0].id

    const parentContainer = await db
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .innerJoin(paper, eq(paper.id, storageContainer.id))
      .where(eq(storageContainer.specimenId, specId))
      .get()

    if (!parentContainer) {
      throw new Error('No paper container found for resolved parent specimen')
    }

    return parentContainer.id
  }

  throw new Error('Unable to resolve parent container; provide parent_container_id, parent_container_barcode, or type-specific parent columns')
}

async function resolveCollectionId(
  containerType: DerivationCsvRow['container_type'],
  collectionName?: string,
  collectionBarcode?: string,
): Promise<number | undefined> {
  if (!collectionName && !collectionBarcode) return undefined

  if (containerType === 'micronix_tube') {
    const q = db
      .select({ id: micronixPlate.id })
      .from(micronixPlate)

    if (collectionBarcode) {
      const plate = await q.where(eq(micronixPlate.barcode, collectionBarcode.trim())).get()
      if (plate) return plate.id
    }
    if (collectionName) {
      const plate = await q.where(eq(micronixPlate.name, collectionName.trim())).get()
      if (plate) return plate.id
    }
  }

  if (containerType === 'cryovial_tube') {
    const q = db
      .select({ id: cryovialBox.id })
      .from(cryovialBox)

    if (collectionBarcode) {
      const box = await q.where(eq(cryovialBox.barcode, collectionBarcode.trim())).get()
      if (box) return box.id
    }
    if (collectionName) {
      const box = await q.where(eq(cryovialBox.name, collectionName.trim())).get()
      if (box) return box.id
    }
  }

  if (containerType === 'paper') {
    const sheetRec = await db
      .select({ id: paper.sheetId })
      .from(paper)
      .limit(1)
      .get()
    return sheetRec?.id
  }

  return undefined
}

export async function importDerivationsFromCsv(
  text: string,
  options: { dryRun?: boolean } = {},
): Promise<{ rows: DerivationCsvResultRow[] }> {
  const rows = parseCsv(text)
  const results: DerivationCsvResultRow[] = []

  const useTx = !options.dryRun

  if (useTx) {
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        try {
          const parentContainerId = await resolveParentContainerId(row)
          const collectionId = await resolveCollectionId(
            row.container_type,
            row.collection_name,
            row.collection_barcode,
          )

          const input: CreateDerivationInput = {
            parentContainerId,
            derivationType: row.derivation_type,
            specimenTypeName: row.specimen_type_name,
            containerType: row.container_type,
            quantity: parseNumber(row.quantity),
            unitSymbol: row.unit_symbol,
            quantityUsed: parseNumber(row.quantity_used),
            reduceParentQuantity: parseBoolean(row.reduce_parent_quantity),
            derivationDate: row.derivation_date,
            protocol: row.protocol,
            notes: row.notes,
            collectionId,
            containerBarcode: row.container_barcode,
            position: row.position,
          }

          const result = await createDerivation(input)

          results.push({
            index: i,
            success: true,
            derivationId: result.derivation.id,
            parentContainerId,
            childContainerId: result.childContainer.id,
            warnings: result.warnings.map(w => w.message),
          })
        } catch (error: any) {
          results.push({
            index: i,
            success: false,
            error: error?.message || String(error),
          })
        }
      }
    })
  } else {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const parentContainerId = await resolveParentContainerId(row)
        const collectionId = await resolveCollectionId(
          row.container_type,
          row.collection_name,
          row.collection_barcode,
        )

        const input: CreateDerivationInput = {
          parentContainerId,
          derivationType: row.derivation_type,
          specimenTypeName: row.specimen_type_name,
          containerType: row.container_type,
          quantity: parseNumber(row.quantity),
          unitSymbol: row.unit_symbol,
          quantityUsed: parseNumber(row.quantity_used),
          reduceParentQuantity: parseBoolean(row.reduce_parent_quantity),
          derivationDate: row.derivation_date,
          protocol: row.protocol,
          notes: row.notes,
          collectionId,
          containerBarcode: row.container_barcode,
          position: row.position,
        }

        const result = await createDerivation(input)

        results.push({
          index: i,
          success: true,
          derivationId: result.derivation.id,
          parentContainerId,
          childContainerId: result.childContainer.id,
          warnings: result.warnings.map(w => w.message),
        })
      } catch (error: any) {
        results.push({
          index: i,
          success: false,
          error: error?.message || String(error),
        })
      }
    }
  }

  return { rows: results }
}


