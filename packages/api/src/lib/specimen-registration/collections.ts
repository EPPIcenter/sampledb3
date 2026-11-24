/**
 * Collection identity for registration: which Collection a container goes into, and which
 * Collections the registration has to create. Every identifier a row gives must name the
 * same Collection; nothing is created unless nothing matches and a location is given.
 */
import { and, eq } from 'drizzle-orm'
import { newCollectionName, type ContainerWriteInput } from '@sampledb/contract'
import type { Database } from '../../db/client'
import { sheet } from '../../db/schema'
import { GRID_COLLECTION_TABLES, PARENT_COLLECTION_TABLES, type GridCollectionType, type ParentCollectionType } from './tables'
import {
  assertLocationCanContainCollections,
  CollectionLocationNotAllowedError,
  CollectionLocationNotFoundError,
} from '../collections/collection-lifecycle'

export type { GridCollectionType, ParentCollectionType } from './tables'

type GridCollectionInput = NonNullable<
  Extract<ContainerWriteInput, { containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well' }>['collection']
>
type SheetCollectionInput = NonNullable<Extract<ContainerWriteInput, { containerType: 'paper' }>['collection']>
type ParentCollectionInput = NonNullable<SheetCollectionInput['parent']>

/** A Collection that exists, or one this registration will create (index into `planned`). */
export type CollectionTarget = { existingId: number } | { plannedIndex: number }

export type PlannedCollection =
  | { type: GridCollectionType; name: string; barcode?: string; locationId: number }
  | { type: ParentCollectionType; name: string; locationId: number }
  | { type: 'sheet'; name: string; parentType: ParentCollectionType; parent: CollectionTarget }

export type Resolution = { target: CollectionTarget } | { error: string; clash?: true }

type Candidate = {
  target: CollectionTarget
  type: GridCollectionType | ParentCollectionType
  name: string
  barcode: string | null
  locationId: number | null
}

const LABELS: Record<GridCollectionType | ParentCollectionType, string> = {
  micronix_plate: 'Micronix plate',
  cryovial_box: 'Cryovial box',
  box: 'Box',
  bag: 'Bag',
}

const PLURALS: Record<GridCollectionType, string> = {
  micronix_plate: 'micronix plates',
  cryovial_box: 'cryovial boxes',
}

/** "a and b", "a, b, and c". */
const AND = new Intl.ListFormat('en', { type: 'conjunction' })

/** Trimmed Collection identifier, or undefined when omitted or blank after trimming. */
function trimmedIdentifier(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function targetKey(target: CollectionTarget): string {
  return 'existingId' in target ? `e${target.existingId}` : `p${target.plannedIndex}`
}

function distinctCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Map<string, Candidate>()
  for (const candidate of candidates) seen.set(targetKey(candidate.target), candidate)
  return [...seen.values()]
}

function locationError(locationId: number, database: Database): string | null {
  try {
    assertLocationCanContainCollections(database, locationId)
    return null
  } catch (error) {
    if (error instanceof CollectionLocationNotFoundError || error instanceof CollectionLocationNotAllowedError) {
      return error.message
    }
    throw error
  }
}

/** Resolves Collections for one registration, remembering the ones it plans to create. */
export class CollectionPlanner {
  readonly planned: PlannedCollection[] = []

  constructor(private readonly database: Database) {}

  private plannedCandidates(
    type: GridCollectionType | ParentCollectionType,
    match: (planned: PlannedCollection) => boolean,
  ): Candidate[] {
    const out: Candidate[] = []
    this.planned.forEach((planned, plannedIndex) => {
      if (planned.type === type && match(planned)) {
        out.push({
          target: { plannedIndex },
          type,
          name: planned.name,
          barcode: 'barcode' in planned ? (planned.barcode ?? null) : null,
          locationId: 'locationId' in planned ? planned.locationId : null,
        })
      }
    })
    return out
  }

  /**
   * A location given for a Collection that exists or is already planned must be the one it has.
   * Checking stored Collections too makes the rule hold when a request is split over several calls.
   */
  private locationConflict(match: Candidate, locationId: number | undefined): string | null {
    if (locationId == null || match.locationId === locationId) return null
    return 'plannedIndex' in match.target
      ? `${LABELS[match.type]} '${match.name}' is given two different locations in this request.`
      : `${LABELS[match.type]} '${match.name}' is stored at a different location from the one given.`
  }

  /** The stored grid Collection whose id, barcode, or name equals `value`. */
  private storedGrid(type: GridCollectionType, by: 'id' | 'barcode' | 'name', value: number | string): Candidate | null {
    const table = GRID_COLLECTION_TABLES[type]
    const row = this.database
      .select({ id: table.id, name: table.name, barcode: table.barcode, locationId: table.locationId })
      .from(table)
      .where(eq(table[by], value))
      .get()
    return row ? { target: { existingId: row.id }, type, name: row.name, barcode: row.barcode, locationId: row.locationId } : null
  }

  /** The stored box or bag whose id or name equals `value`. */
  private storedParent(type: ParentCollectionType, by: 'id' | 'name', value: number | string): Candidate | null {
    const table = PARENT_COLLECTION_TABLES[type]
    const row = this.database
      .select({ id: table.id, name: table.name, locationId: table.locationId })
      .from(table)
      .where(eq(table[by], value))
      .get()
    return row ? { target: { existingId: row.id }, type, name: row.name, barcode: null, locationId: row.locationId } : null
  }

  async resolveGrid(type: GridCollectionType, collection: GridCollectionInput): Promise<Resolution> {
    const label = LABELS[type]
    const candidates: Candidate[] = []
    /** The identifier that first found each Collection, by targetKey. */
    const foundBy = new Map<string, 'id' | 'barcode' | 'name'>()
    const found = (by: 'id' | 'barcode' | 'name', matched: Candidate[]) => {
      for (const candidate of matched) {
        candidates.push(candidate)
        const key = targetKey(candidate.target)
        if (!foundBy.has(key)) foundBy.set(key, by)
      }
    }

    if (collection.id != null) {
      const byId = this.storedGrid(type, 'id', collection.id)
      if (!byId) return { error: `${label} not found: id ${collection.id}` }
      found('id', [byId])
    }
    const barcode = trimmedIdentifier(collection.barcode)
    const name = trimmedIdentifier(collection.name)
    if (barcode) {
      const stored = this.storedGrid(type, 'barcode', barcode)
      found('barcode', stored ? [stored] : this.plannedCandidates(type, (p) => 'barcode' in p && p.barcode === barcode))
    }
    if (name) {
      const stored = this.storedGrid(type, 'name', name)
      found('name', stored ? [stored] : this.plannedCandidates(type, (p) => p.name === name))
    }

    const matches = distinctCandidates(candidates)
    if (matches.length > 1) {
      // foundBy and matches are both in the order the Collections were first found.
      const identifiers = AND.format(foundBy.values())
      const names = AND.format(matches.map((m) => `'${m.name}'`))
      return { error: `Collection ${identifiers} point to different ${PLURALS[type]}: ${names}.` }
    }
    const match = matches.at(0)
    if (match) {
      if (barcode && match.barcode !== barcode) {
        const actual = match.barcode ? `has barcode '${match.barcode}'` : 'has no barcode'
        return { error: `${label} '${match.name}' ${actual}, not '${barcode}'.` }
      }
      if (name && match.name !== name) {
        // The name matched nothing, so the id or, failing that, the barcode found this one.
        const found = collection.id != null ? `${label} id ${collection.id}` : `${label} with barcode '${barcode ?? ''}'`
        return { error: `${found} is named '${match.name}', not '${name}'.` }
      }
      const conflict = this.locationConflict(match, collection.locationId)
      if (conflict) return { error: conflict }
      return { target: match.target }
    }

    if (collection.locationId == null) {
      return { error: 'Collection not found and no location provided' }
    }
    const newName = newCollectionName({ name, barcode })
    if (!newName) {
      return { error: `A new ${label.toLowerCase()} needs a name or a barcode.` }
    }
    if (!name) {
      // Created from a barcode alone, the Collection takes the barcode as its name, and names are
      // unique per type. The lookups above searched for the barcode, not for that name.
      const kind = label.toLowerCase()
      if (this.storedGrid(type, 'name', newName)) {
        return {
          error: `A new ${kind} with barcode '${newName}' and no name would be named '${newName}', but a ${kind} with that name already exists. Give the new ${kind} a name.`,
          clash: true,
        }
      }
      if (this.plannedCandidates(type, (p) => p.name === newName).length > 0) {
        return {
          error: `A new ${kind} with barcode '${newName}' and no name would be named '${newName}', but this request already creates a ${kind} with that name. Give the new ${kind} a name.`,
        }
      }
    }
    const badLocation = locationError(collection.locationId, this.database)
    if (badLocation) return { error: badLocation }
    this.planned.push({ type, name: newName, barcode, locationId: collection.locationId })
    return { target: { plannedIndex: this.planned.length - 1 } }
  }

  async resolveParent(parent: ParentCollectionInput): Promise<Resolution> {
    const type = parent.type
    const label = LABELS[type]
    const candidates: Candidate[] = []

    if (parent.id != null) {
      const byId = this.storedParent(type, 'id', parent.id)
      if (!byId) return { error: `${label} not found: id ${parent.id}` }
      candidates.push(byId)
    }
    const name = trimmedIdentifier(parent.name)
    if (name) {
      const stored = this.storedParent(type, 'name', name)
      candidates.push(...(stored ? [stored] : this.plannedCandidates(type, (p) => p.name === name)))
    }

    const matches = distinctCandidates(candidates)
    const match = matches.at(0)
    if (match) {
      if (matches.length > 1 || (name && match.name !== name)) {
        return { error: `${label} id ${parent.id ?? ''} is named '${match.name}', not '${name ?? ''}'.` }
      }
      const conflict = this.locationConflict(match, parent.locationId)
      if (conflict) return { error: conflict }
      return { target: match.target }
    }

    if (!name) {
      return { error: `A new ${label.toLowerCase()} needs a name.` }
    }
    if (parent.locationId == null) {
      return { error: `Collection (${type}) not found: ${name}` }
    }
    const badLocation = locationError(parent.locationId, this.database)
    if (badLocation) return { error: badLocation }
    this.planned.push({ type, name, locationId: parent.locationId })
    return { target: { plannedIndex: this.planned.length - 1 } }
  }

  async resolveSheet(collection: SheetCollectionInput): Promise<Resolution> {
    const name = trimmedIdentifier(collection.name)
    if (collection.id != null) {
      const row = await this.database.select().from(sheet).where(eq(sheet.id, collection.id)).get()
      if (!row) return { error: `Sheet not found: id ${collection.id}` }
      if (name && name !== row.name) {
        return { error: `Sheet id ${collection.id} is named '${row.name}', not '${name}'.` }
      }
      if (collection.parent) {
        const plannedBefore = this.planned.length
        const parent = await this.resolveParent(collection.parent)
        if ('error' in parent) return parent
        const parentId = collection.parent.type === 'box' ? row.boxId : row.bagId
        if (!('existingId' in parent.target) || parent.target.existingId !== parentId) {
          // resolveParent may have planned a new box or bag for this row. The row is refused, so
          // drop it: a later container naming that box or bag must not find it planned.
          this.planned.length = plannedBefore
          return { error: `Sheet id ${collection.id} is not in that ${collection.parent.type}.` }
        }
      }
      return { target: { existingId: row.id } }
    }

    if (!name) return { error: 'A sheet needs an id or a name.' }
    if (!collection.parent) return { error: 'A sheet named without an id needs its box or bag.' }

    const parentType = collection.parent.type
    const parent = await this.resolveParent(collection.parent)
    if ('error' in parent) return parent

    if ('existingId' in parent.target) {
      const parentColumn = parentType === 'box' ? sheet.boxId : sheet.bagId
      const row = await this.database
        .select({ id: sheet.id })
        .from(sheet)
        .where(and(eq(sheet.name, name), eq(parentColumn, parent.target.existingId)))
        .get()
      if (row) return { target: { existingId: row.id } }
    }

    const parentKey = targetKey(parent.target)
    const plannedIndex = this.planned.findIndex(
      (p) => p.type === 'sheet' && p.name === name && p.parentType === parentType && targetKey(p.parent) === parentKey,
    )
    if (plannedIndex >= 0) return { target: { plannedIndex } }

    this.planned.push({ type: 'sheet', name, parentType, parent: parent.target })
    return { target: { plannedIndex: this.planned.length - 1 } }
  }
}
