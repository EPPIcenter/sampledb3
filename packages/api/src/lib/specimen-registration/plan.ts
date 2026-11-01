/**
 * Plan a registration: resolve every Specimen, Collection, unit, and placement, and collect
 * every problem. Reads only; the write step trusts the plan.
 */
import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../../db/client'
import {
  controlBatch,
  paper,
  specimen,
  specimenType,
  studySubject,
  type Specimen,
} from '../../db/schema'
import { getDefaultRemainingQuantity, getDefaultTotalQuantity, getDefaultUnit } from '../defaults'
import { normalizePosition } from '../normalize-position'
import { checkGridPositionOccupancy, occupiedGridPositionMessage } from '../container-occupancy'
import {
  validateCollectionDate,
  validateContainerTypeForSpecimenType,
  validateUnitForContainerType,
} from '../validation'
import { GRID_COLLECTION_OF } from './tables'
import { findTubesUsingBarcode } from '../identifier-resolution'
import { CollectionPlanner, targetKey, type CollectionTarget, type GridCollectionType, type PlannedCollection } from './collections'
import { validateContainerWriteFields } from './container-fields'
import type { RegistrationContainer, RegistrationEntry, RegistrationError, RegistrationSource } from './types'

export type PlannedSpecimen =
  | { existing: Specimen }
  | {
      existing: null
      source: RegistrationSource
      specimenTypeId: number
      collectionDate: string | null
    }

export type PlannedContainer = {
  entryIndex: number
  containerIndex: number
  input: RegistrationContainer
  unitId: number
  totalQuantity: number
  remainingQuantity: number
  /** Plate or box for tubes and wells, Sheet for paper. */
  collection: CollectionTarget
  position: string | null
}

export type RegistrationPlan = {
  specimens: PlannedSpecimen[]
  /** entries[i] registers specimens[specimenIndexOfEntry[i]]; undefined when the entry has errors. */
  specimenIndexOfEntry: Array<number | undefined>
  containers: PlannedContainer[]
  collections: PlannedCollection[]
}

function findSpecimen(
  database: Database,
  source: RegistrationSource,
  specimenTypeId: number,
  collectionDate: string | null,
): Specimen | null {
  const sourceCondition =
    'subjectId' in source
      ? eq(specimen.studySubjectId, source.subjectId)
      : eq(specimen.controlBatchId, source.controlBatchId)
  const dateCondition = collectionDate == null ? isNull(specimen.collectionDate) : eq(specimen.collectionDate, collectionDate)
  return (
    database
      .select()
      .from(specimen)
      .where(and(sourceCondition, eq(specimen.specimenTypeId, specimenTypeId), dateCondition))
      .get() ?? null
  )
}

/** What makes two entries the same Specimen (ADR 0010, Specimen identity). */
type SpecimenIdentity =
  | { kind: 'existing'; specimenId: number }
  | { kind: 'new'; source: RegistrationSource; specimenTypeId: number; collectionDate: string | null }

function specimenIdentityKey(identity: SpecimenIdentity): string {
  if (identity.kind === 'existing') return `id:${identity.specimenId}`
  const { source, specimenTypeId, collectionDate } = identity
  const sourceKey = 'subjectId' in source ? `subject:${source.subjectId}` : `control:${source.controlBatchId}`
  return `${sourceKey}:${specimenTypeId}:${collectionDate ?? ''}`
}

/** Something a request may use only once. */
type Claim =
  | { kind: 'barcode'; barcode: string }
  | { kind: 'position'; gridType: GridCollectionType; collection: CollectionTarget; position: string }
  | { kind: 'sublabel'; sheet: CollectionTarget; sublabel: string }

function claimKey(claim: Claim): string {
  switch (claim.kind) {
    case 'barcode':
      // Tube barcodes are unique across types and case.
      return `barcode:${claim.barcode.toLowerCase()}`
    case 'position':
      return `position:${claim.gridType}:${targetKey(claim.collection)}:${claim.position}`
    case 'sublabel':
      return `sublabel:${targetKey(claim.sheet)}:${claim.sublabel}`
  }
}

/** Per-request uniqueness: barcodes, Grid positions per Collection, sublabels per Sheet. */
class RequestClaims {
  private readonly taken = new Set<string>()

  /** How messages name the input a claim repeats in (RegistrationOptions.inputName). */
  constructor(readonly inputName: string) {}

  /** Returns false when the claim was already taken earlier in the request. */
  take(claim: Claim): boolean {
    const key = claimKey(claim)
    if (this.taken.has(key)) return false
    this.taken.add(key)
    return true
  }
}

export async function planRegistration(
  database: Database,
  entries: RegistrationEntry[],
  inputName = 'this request',
): Promise<{ plan: RegistrationPlan; errors: RegistrationError[] }> {
  const errors: RegistrationError[] = []
  const planner = new CollectionPlanner(database)
  const claims = new RequestClaims(inputName)
  const specimens: PlannedSpecimen[] = []
  const specimenIndexByKey = new Map<string, number>()
  const specimenIndexOfEntry: Array<number | undefined> = []
  const containers: PlannedContainer[] = []

  /** The index in `specimens` of the Specimen with this identity, planning it on first sight. */
  const specimenIndexFor = (identity: SpecimenIdentity, make: () => PlannedSpecimen): number => {
    const key = specimenIdentityKey(identity)
    const known = specimenIndexByKey.get(key)
    if (known !== undefined) return known
    specimens.push(make())
    specimenIndexByKey.set(key, specimens.length - 1)
    return specimens.length - 1
  }

  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex]
    const entryError = (field: string, message: string) => errors.push({ entryIndex, field, message })
    let specimenTypeId: number | null = null

    if ('specimenId' in entry) {
      const existing = database.select().from(specimen).where(eq(specimen.id, entry.specimenId)).get()
      if (!existing) {
        entryError('specimenId', 'Specimen not found')
        specimenIndexOfEntry.push(undefined)
        continue
      }
      specimenTypeId = existing.specimenTypeId
      specimenIndexOfEntry.push(specimenIndexFor({ kind: 'existing', specimenId: existing.id }, () => ({ existing })))
    } else {
      let sourceOk = true
      if ('subjectId' in entry.source) {
        const subjectId = entry.source.subjectId
        if (!database.select({ id: studySubject.id }).from(studySubject).where(eq(studySubject.id, subjectId)).get()) {
          entryError('source', 'Subject not found')
          sourceOk = false
        }
      } else {
        const batchId = entry.source.controlBatchId
        if (!database.select({ id: controlBatch.id }).from(controlBatch).where(eq(controlBatch.id, batchId)).get()) {
          entryError('source', 'Control batch not found')
          sourceOk = false
        }
      }
      const typeExists = database
        .select({ id: specimenType.id })
        .from(specimenType)
        .where(eq(specimenType.id, entry.specimenTypeId))
        .get()
      if (typeExists) specimenTypeId = entry.specimenTypeId
      else entryError('specimenTypeId', 'Specimen type not found')

      const date = validateCollectionDate(entry.collectionDate)
      if (!date.valid) entryError('collectionDate', date.error)

      if (sourceOk && specimenTypeId !== null && date.valid) {
        const identity = {
          kind: 'new' as const,
          source: entry.source,
          specimenTypeId,
          collectionDate: date.normalized ?? null,
        }
        specimenIndexOfEntry.push(
          specimenIndexFor(identity, () => {
            const { source, specimenTypeId: typeId, collectionDate } = identity
            const existing = findSpecimen(database, source, typeId, collectionDate)
            return existing ? { existing } : { existing: null, source, specimenTypeId: typeId, collectionDate }
          }),
        )
      } else {
        specimenIndexOfEntry.push(undefined)
      }
    }

    for (let containerIndex = 0; containerIndex < entry.containers.length; containerIndex++) {
      const planned = await planContainer(database, planner, claims, entry.containers[containerIndex], specimenTypeId)
      if ('errors' in planned) {
        for (const e of planned.errors) errors.push({ entryIndex, containerIndex, ...e })
      } else {
        containers.push({ entryIndex, containerIndex, ...planned })
      }
    }
  }

  return { plan: { specimens, specimenIndexOfEntry, containers, collections: planner.planned }, errors }
}

type ContainerProblem = { field: string; message: string }

async function planContainer(
  database: Database,
  planner: CollectionPlanner,
  claims: RequestClaims,
  input: RegistrationContainer,
  specimenTypeId: number | null,
): Promise<Omit<PlannedContainer, 'entryIndex' | 'containerIndex'> | { errors: ContainerProblem[] }> {
  const problems: ContainerProblem[] = []
  const containerType = input.containerType

  const fields = validateContainerWriteFields(input)
  if (!fields.valid) {
    return { errors: [{ field: fields.field, message: fields.error }] }
  }

  if (specimenTypeId !== null) {
    const allowed = await validateContainerTypeForSpecimenType(database, specimenTypeId, containerType)
    if (!allowed.valid) problems.push({ field: 'containerType', message: allowed.error ?? 'Container type not allowed' })
  }

  let unitId = input.unitId ?? null
  let totalQuantity = 0
  let remainingQuantity = 0
  try {
    unitId ??= await getDefaultUnit(database, containerType)
    const unitAllowed = await validateUnitForContainerType(database, containerType, unitId)
    if (!unitAllowed.valid) problems.push({ field: 'unitId', message: unitAllowed.error ?? 'Unit not allowed' })
    totalQuantity = input.totalQuantity ?? (await getDefaultTotalQuantity(database, containerType))
    remainingQuantity =
      input.remainingQuantity ?? input.totalQuantity ?? (await getDefaultRemainingQuantity(database, containerType))
  } catch (error) {
    problems.push({ field: 'unitId', message: error instanceof Error ? error.message : 'Container defaults are not configured' })
  }

  let collection: CollectionTarget | null = null
  let position: string | null = null

  if (input.containerType === 'paper') {
    // validateContainerWriteFields guarantees a collection.
    const resolved = input.collection ? await planner.resolveSheet(input.collection) : { error: 'Collection is required for paper containers' }
    if ('error' in resolved) {
      problems.push({ field: 'collection', message: resolved.error })
    } else {
      collection = resolved.target
      const sublabel = input.sublabel?.trim()
      if (sublabel) {
        if ('existingId' in collection) {
          const taken = database
            .select({ id: paper.id })
            .from(paper)
            .where(and(eq(paper.sheetId, collection.existingId), eq(paper.sublabel, sublabel)))
            .get()
          if (taken) problems.push({ field: 'sublabel', message: `Sublabel '${sublabel}' is already used on this sheet.` })
        }
        if (!claims.take({ kind: 'sublabel', sheet: collection, sublabel })) {
          problems.push({ field: 'sublabel', message: `Sublabel '${sublabel}' is used more than once on this sheet in ${claims.inputName}.` })
        }
      }
    }
  } else {
    const gridType = GRID_COLLECTION_OF[input.containerType]
    const resolved = input.collection
      ? await planner.resolveGrid(gridType, input.collection)
      : { error: 'Collection name or barcode is required' }
    if ('error' in resolved) {
      problems.push({ field: 'collection', message: resolved.error })
    } else {
      collection = resolved.target
      position = normalizePosition(input.collection?.position)
      if (position) {
        if ('existingId' in collection) {
          const occupancy = await checkGridPositionOccupancy(database, {
            collectionKind: gridType,
            collectionId: collection.existingId,
            position,
          })
          if (occupancy.occupied) problems.push({ field: 'position', message: occupiedGridPositionMessage(position, gridType) })
        }
        if (!claims.take({ kind: 'position', gridType, collection, position })) {
          problems.push({
            field: 'position',
            message: `Position ${position} in this plate/box is used more than once in ${claims.inputName}. Each position can only be used once.`,
          })
        }
      }
    }

    const barcode = 'barcode' in input ? input.barcode?.trim() : undefined
    if (barcode && (input.containerType === 'micronix_tube' || input.containerType === 'cryovial_tube')) {
      // A tube barcode must be new across every tube type, ignoring case and whitespace.
      const taken = await findTubesUsingBarcode(database, barcode)
      if (taken.length > 0) {
        const asVariant = taken.some((match) => match.barcode === barcode) ? '' : ` as '${taken[0].barcode}'`
        problems.push({ field: 'barcode', message: `Barcode '${barcode}' already exists${asVariant}. Use a different barcode.` })
      }
      if (!claims.take({ kind: 'barcode', barcode })) {
        problems.push({
          field: 'barcode',
          message: `Barcode '${barcode}' is used more than once in ${claims.inputName}. Each barcode must be unique.`,
        })
      }
    }
  }

  if (problems.length > 0 || collection === null || unitId === null) {
    return { errors: problems }
  }
  return { input, unitId, totalQuantity, remainingQuantity, collection, position }
}
