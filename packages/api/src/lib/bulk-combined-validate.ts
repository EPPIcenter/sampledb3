/**
 * Upfront validation for bulk-combined import. Runs all DB and payload checks
 * without performing any inserts; returns all errors for display.
 */
import type { Database } from '../db/client'
import {
  location,
  micronixTube,
  cryovialTube,
  staticWell,
  box,
  sheet,
} from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveCollection } from './collection-resolution'
import {
  validateStudyShortCode,
  validateSubjectName,
  validateCollectionDate,
  validateContainerTypeForSpecimenType,
  validateUnitForContainerType,
} from './validation'
import { getDefaultUnit } from './defaults'
import { resolveSubjectByNameAndStudy, resolveSpecimenTypeByName } from './identifier-resolution'
import {
  normalizePosition,
  type ExtendedContainerData,
  type BulkCombinedPayload,
} from './bulk-combined-import'

const LOCATION_CANNOT_CONTAIN_COLLECTIONS =
  'Location cannot contain collections. Only locations with canContainCollections=true can hold collections.'

export interface BulkCombinedValidateError {
  subjectIndex: number
  specimenIndex?: number
  rowIndex?: number
  message: string
}

export interface BulkCombinedValidateResult {
  valid: boolean
  errors: BulkCombinedValidateError[]
}

/** Payload for validate: same as BulkCombinedPayload but specimens may include optional rowIndex */
export type BulkCombinedValidatePayload = Omit<BulkCombinedPayload, 'subjects'> & {
  subjects: Array<{
    subjectName: string
    specimens: Array<{
      specimenTypeName: string
      collectionDate?: string
      container?: ExtendedContainerData
      rowIndex?: number
    }>
  }>
}

interface ContainerRowForSecondPass {
  subjectIndex: number
  specimenIndex: number
  rowIndex?: number
  collectionKey: string
  collectionId: number | null
  normalizedPosition: string | null
  barcode: string | null
  containerType: ExtendedContainerData['containerType']
  boxKey: string | null
  sheetName: string | null
}

export async function validateBulkCombinedPayload(
  database: Database,
  payload: BulkCombinedValidatePayload
): Promise<BulkCombinedValidateResult> {
  const errors: BulkCombinedValidateError[] = []
  const { studyShortCode, createCollections = [], subjects } = payload

  const add = (subjectIndex: number, specimenIndex: number, message: string, rowIndex?: number) => {
    errors.push({ subjectIndex, specimenIndex, message, ...(rowIndex !== undefined && { rowIndex }) })
  }

  // 1. Validate createCollections locations
  for (let c = 0; c < createCollections.length; c++) {
    const coll = createCollections[c]
    const loc = await database.select().from(location).where(eq(location.id, coll.locationId)).get()
    if (!loc) {
      add(0, 0, `Location not found for collection '${coll.name}' (${coll.type})`)
      continue
    }
    if (!loc.canContainCollections) {
      add(0, 0, `${LOCATION_CANNOT_CONTAIN_COLLECTIONS} Collection '${coll.name}' uses location ID ${coll.locationId}.`)
    }
  }

  // 2. Validate study
  const studyValidation = await validateStudyShortCode(database, studyShortCode)
  let studyId: number | null = null
  if (!studyValidation.valid || !studyValidation.studyId) {
    add(0, 0, studyValidation.error ?? 'Invalid study')
  } else {
    studyId = studyValidation.studyId
  }

  const containerRowsForSecondPass: ContainerRowForSecondPass[] = []
  const collectionKeyToId = new Map<string, number>()
  const toBeCreatedKeys = new Set<string>()
  for (const coll of createCollections) {
    toBeCreatedKeys.add(`${coll.type}-${coll.name}`)
  }

  // 3. Per-subject and per-specimen validation (first pass)
  for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex++) {
    const subj = subjects[subjectIndex]
    const trimmedName = subj.subjectName.trim()

    if (studyId !== null) {
      const existingSubjectId = await resolveSubjectByNameAndStudy(database, trimmedName, studyId)
      if (!existingSubjectId) {
        const nameValidation = await validateSubjectName(database, studyId, trimmedName)
        if (!nameValidation.valid) {
          add(subjectIndex, 0, nameValidation.error ?? 'Invalid subject name')
        }
      }
    }

    for (let specimenIndex = 0; specimenIndex < subj.specimens.length; specimenIndex++) {
      const spec = subj.specimens[specimenIndex]
      const rowIndex = 'rowIndex' in spec ? spec.rowIndex : undefined

      const specimenTypeId = await resolveSpecimenTypeByName(database, spec.specimenTypeName)
      if (!specimenTypeId) {
        add(subjectIndex, specimenIndex, `Specimen type '${spec.specimenTypeName}' not found`, rowIndex)
      }

      const dateValidation = validateCollectionDate(spec.collectionDate)
      if (!dateValidation.valid) {
        add(subjectIndex, specimenIndex, dateValidation.error ?? 'Invalid collection date', rowIndex)
      }

      if (!spec.container?.containerType) {
        continue
      }

      const container = spec.container
      const containerType = container.containerType

      if (specimenTypeId) {
        const containerTypeValidation = await validateContainerTypeForSpecimenType(
          database,
          specimenTypeId,
          containerType
        )
        if (!containerTypeValidation.valid) {
          add(subjectIndex, specimenIndex, containerTypeValidation.error ?? 'Invalid container type for specimen type', rowIndex)
        }
      }

      let collectionKey: string
      let collectionId: number | null = null
      const collectionType = containerType === 'cryovial_tube' ? 'cryovial_box' : containerType === 'paper' ? 'box' : 'micronix_plate'
      const identifier = container.collectionName || container.collectionBarcode

      if (containerType === 'paper') {
        if (!container.collectionName) {
          add(subjectIndex, specimenIndex, 'Box name (collection name) is required for paper', rowIndex)
        }
        const boxName = container.collectionName ?? ''
        collectionKey = `box-${boxName}`
        if (boxName) {
          collectionId = await resolveCollection(boxName, 'box', database)
          if (!collectionId && !container.collectionLocationId) {
            add(subjectIndex, specimenIndex, `Box '${boxName}' not found. Provide collectionLocationId to create it.`, rowIndex)
          }
          if (container.collectionLocationId) {
            toBeCreatedKeys.add(collectionKey)
          }
        }
      } else {
        if (!identifier && (containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well')) {
          add(subjectIndex, specimenIndex, 'Plate/box name or barcode is required', rowIndex)
        }
        collectionKey = `${collectionType}-${identifier ?? ''}`
        if (identifier) {
          collectionId = await resolveCollection(identifier, collectionType, database)
          if (!collectionId && !container.collectionLocationId) {
            add(subjectIndex, specimenIndex, `Collection '${identifier}' not found. Provide collectionLocationId to create it.`, rowIndex)
          }
          if (container.collectionLocationId) {
            toBeCreatedKeys.add(collectionKey)
          } else if (collectionId) {
            collectionKeyToId.set(collectionKey, collectionId)
          }
        }
      }

      if (containerType !== 'paper') {
        try {
          const unitId = container.unitId ?? (await getDefaultUnit(database, containerType))
          const unitValidation = await validateUnitForContainerType(database, containerType, unitId)
          if (!unitValidation.valid) {
            add(subjectIndex, specimenIndex, unitValidation.error ?? 'Invalid unit for container type', rowIndex)
          }
        } catch {
          add(subjectIndex, specimenIndex, 'Default unit not configured for this container type', rowIndex)
        }
      }

      const normalizedPosition = normalizePosition(container.position)
      if ((containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well') && !normalizedPosition) {
        add(subjectIndex, specimenIndex, 'Position is required for this container type (e.g. A01)', rowIndex)
      }
      if (containerType === 'paper' && !container.label?.trim()) {
        add(subjectIndex, specimenIndex, 'Label (sheet name) is required for paper', rowIndex)
      }
      if (containerType === 'micronix_tube' && (!container.barcode || !container.barcode.trim())) {
        add(subjectIndex, specimenIndex, 'Barcode is required for micronix tubes', rowIndex)
      }

      const resolvedId = collectionId ?? (collectionKeyToId.get(collectionKey) ?? null)
      containerRowsForSecondPass.push({
        subjectIndex,
        specimenIndex,
        rowIndex,
        collectionKey,
        collectionId: resolvedId,
        normalizedPosition,
        barcode: container.barcode?.trim() || null,
        containerType,
        boxKey: containerType === 'paper' ? `box-${container.collectionName ?? ''}` : null,
        sheetName: containerType === 'paper' ? (container.label ?? 'Sheet-1').trim() : null,
      })
    }
  }

  // 4. Second pass: barcode uniqueness (DB + in-payload), position uniqueness (DB + in-payload), sheet+box for paper
  const seenBarcodes = new Set<string>()
  const seenPositionByCollection = new Map<string, Set<string>>()
  const seenSheetByBox = new Map<string, Set<string>>()

  for (const row of containerRowsForSecondPass) {
    const { subjectIndex, specimenIndex, rowIndex, collectionKey, collectionId, normalizedPosition, barcode, containerType, boxKey, sheetName } = row

    if (containerType === 'micronix_tube' || containerType === 'cryovial_tube') {
      if (barcode) {
        const existingInDb = containerType === 'micronix_tube'
          ? await database.select({ id: micronixTube.id }).from(micronixTube).where(eq(micronixTube.barcode, barcode)).get()
          : await database.select({ id: cryovialTube.id }).from(cryovialTube).where(eq(cryovialTube.barcode, barcode)).get()
        if (existingInDb) {
          add(subjectIndex, specimenIndex, `Barcode '${barcode}' already exists. Use a different barcode.`, rowIndex)
        }
        if (seenBarcodes.has(barcode)) {
          add(subjectIndex, specimenIndex, `Barcode '${barcode}' is used more than once in your file. Each barcode must be unique.`, rowIndex)
        }
        seenBarcodes.add(barcode)
      }
    }

    if (normalizedPosition && (containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well')) {
      if (collectionId !== null) {
        if (containerType === 'micronix_tube' || containerType === 'static_well') {
          const existingTube = await database
            .select({ id: micronixTube.id })
            .from(micronixTube)
            .where(and(eq(micronixTube.collectionId, collectionId), eq(micronixTube.position, normalizedPosition)))
            .get()
          const existingWell = containerType === 'static_well'
            ? await database
                .select({ id: staticWell.id })
                .from(staticWell)
                .where(and(eq(staticWell.collectionId, collectionId), eq(staticWell.position, normalizedPosition)))
                .get()
            : null
          if (existingTube || existingWell) {
            add(subjectIndex, specimenIndex, `Position ${normalizedPosition} is already used in this plate. Use a different position or plate.`, rowIndex)
          }
        } else {
          const existing = await database
            .select({ id: cryovialTube.id })
            .from(cryovialTube)
            .where(and(eq(cryovialTube.collectionId, collectionId), eq(cryovialTube.position, normalizedPosition)))
            .get()
          if (existing) {
            add(subjectIndex, specimenIndex, `Position ${normalizedPosition} is already used in this box. Use a different position or box.`, rowIndex)
          }
        }
      }
      let positionSet = seenPositionByCollection.get(collectionKey)
      if (!positionSet) {
        positionSet = new Set()
        seenPositionByCollection.set(collectionKey, positionSet)
      }
      if (positionSet.has(normalizedPosition)) {
        add(subjectIndex, specimenIndex, `Position ${normalizedPosition} in this plate/box is used more than once in your file. Each position can only be used once.`, rowIndex)
      }
      positionSet.add(normalizedPosition)
    }

    if (containerType === 'paper' && boxKey && sheetName) {
      if (collectionId !== null) {
        const existingSheet = await database
          .select({ id: sheet.id })
          .from(sheet)
          .where(and(eq(sheet.name, sheetName), eq(sheet.boxId, collectionId)))
          .get()
        if (existingSheet) {
          // Reusing existing sheet - no error
        }
      }
      let sheetSet = seenSheetByBox.get(boxKey)
      if (!sheetSet) {
        sheetSet = new Set()
        seenSheetByBox.set(boxKey, sheetSet)
      }
      if (sheetSet.has(sheetName)) {
        add(subjectIndex, specimenIndex, `Sheet name '${sheetName}' in box is used more than once in your file.`, rowIndex)
      }
      sheetSet.add(sheetName)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
