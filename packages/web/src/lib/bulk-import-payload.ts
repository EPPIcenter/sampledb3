/**
 * Build API payloads for bulk import in one place so validate and import stay aligned.
 */
import type {
  BulkCombinedContainer,
  BulkCombinedRequest,
  BulkCombinedValidateRequest,
  ContainerWriteInput,
} from '@sampledb/contract'
import type { BulkCombinedAtomicMode } from './api/imports'
import type { ContainerType } from './container-types'

export interface MissingCollectionForPayload {
  name: string
  barcode?: string
  locationId: number | null
  collectionBarcode?: string
}

/** Internal flat container shape from CSV row mapping (specimens bulk still uses this). */
export interface FlatBulkImportContainer {
  containerType: ContainerType
  parentCollectionType?: 'box' | 'bag'
  collectionName?: string
  collectionBarcode?: string
  barcode?: string
  position?: string
  sheetName?: string
  sublabel?: string
  comment?: string
  collectionLocationId?: number
}

export function buildCollectionLocationMap(
  missingCollections: MissingCollectionForPayload[]
): Map<string, number> {
  const collectionLocationMap = new Map<string, number>()
  for (const coll of missingCollections) {
    if (coll.locationId != null && coll.name) {
      collectionLocationMap.set(coll.name, coll.locationId)
    }
    if (coll.locationId != null && coll.barcode) {
      collectionLocationMap.set(coll.barcode, coll.locationId)
    }
  }
  return collectionLocationMap
}

function resolveCollectionLocationId(
  flat: FlatBulkImportContainer,
  collectionLocationMap: Map<string, number>
): number | undefined {
  if (flat.collectionLocationId != null) {
    return flat.collectionLocationId
  }
  if (flat.collectionName) {
    const byName = collectionLocationMap.get(flat.collectionName)
    if (byName != null) return byName
  }
  if (flat.collectionBarcode) {
    const byBarcode = collectionLocationMap.get(flat.collectionBarcode)
    if (byBarcode != null) return byBarcode
  }
  return undefined
}

/** Map flat wizard/CSV container fields to unified bulk-combined write shape. */
export function flatBulkContainerToWriteInput(
  flat: FlatBulkImportContainer,
  collectionLocationMap: Map<string, number>
): BulkCombinedContainer {
  const locationId = resolveCollectionLocationId(flat, collectionLocationMap)
  const comment = flat.comment
  const locationField = locationId != null ? { locationId } : {}

  if (flat.containerType === 'micronix_tube') {
    const write: ContainerWriteInput = {
      containerType: 'micronix_tube',
      barcode: flat.barcode ?? '',
      ...(comment ? { comment } : {}),
      collection: {
        type: 'micronix_plate',
        ...(flat.collectionName ? { name: flat.collectionName } : {}),
        ...(flat.collectionBarcode ? { barcode: flat.collectionBarcode } : {}),
        ...(flat.position ? { position: flat.position } : {}),
        ...locationField,
      },
    }
    return write
  }

  if (flat.containerType === 'cryovial_tube') {
    const write: ContainerWriteInput = {
      containerType: 'cryovial_tube',
      ...(flat.barcode ? { barcode: flat.barcode } : {}),
      ...(comment ? { comment } : {}),
      collection: {
        type: 'cryovial_box',
        ...(flat.collectionName ? { name: flat.collectionName } : {}),
        ...(flat.collectionBarcode ? { barcode: flat.collectionBarcode } : {}),
        ...(flat.position ? { position: flat.position } : {}),
        ...locationField,
      },
    }
    return write
  }

  if (flat.containerType === 'static_well') {
    const write: ContainerWriteInput = {
      containerType: 'static_well',
      ...(comment ? { comment } : {}),
      collection: {
        type: 'micronix_plate',
        ...(flat.collectionName ? { name: flat.collectionName } : {}),
        ...(flat.collectionBarcode ? { barcode: flat.collectionBarcode } : {}),
        ...(flat.position ? { position: flat.position } : {}),
        ...locationField,
      },
    }
    return write
  }

  const write: ContainerWriteInput = {
    containerType: 'paper',
    ...(flat.sublabel ? { sublabel: flat.sublabel } : {}),
    ...(comment ? { comment } : {}),
    collection: {
      type: 'sheet',
      ...(flat.sheetName ? { name: flat.sheetName } : {}),
      ...(flat.collectionName
        ? {
            parent: {
              type: flat.parentCollectionType ?? 'box',
              name: flat.collectionName,
              ...locationField,
            },
          }
        : {}),
    },
  }
  return write
}

/** Map flat CSV/wizard rows to POST /specimens/bulk nested container write shape. */
export function buildSpecimensWithLocationIds(
  data: Record<string, unknown>[],
  collectionLocationMap: Map<string, number>
): Record<string, unknown>[] {
  return data.map((spec) => {
    if (!spec.container) return spec
    const container = flatBulkContainerToWriteInput(
      spec.container as FlatBulkImportContainer,
      collectionLocationMap
    )
    return { ...spec, container }
  })
}

/** Strip validate-only rowIndex before POST /imports/bulk-combined. */
export function toBulkCombinedImportRequest(
  payload: BulkCombinedValidateRequest
): BulkCombinedRequest {
  return {
    studyShortCode: payload.studyShortCode,
    atomicMode: payload.atomicMode,
    subjects: payload.subjects.map(({ subjectName, specimens }) => ({
      subjectName,
      specimens: specimens.map(({ specimenTypeName, collectionDate, container }) => ({
        specimenTypeName,
        collectionDate,
        container,
      })),
    })),
  }
}

/** Combined import validate payload (includes rowIndex for CSV alignment). */
export function buildBulkCombinedRequestPayload(
  data: Record<string, unknown>[],
  opts: {
    containerType: ContainerType | 'none' | ''
    fixedStudyShortCode: string | undefined
    /** Pass component state: missing collections with locations for full_file create. */
    missingCollections: MissingCollectionForPayload[]
    atomicMode: BulkCombinedAtomicMode
  }
): BulkCombinedValidateRequest {
  const { fixedStudyShortCode, missingCollections } = opts
  const collectionLocationMap = buildCollectionLocationMap(missingCollections)

  const subjectMap = new Map<string, BulkCombinedValidateRequest['subjects'][number]['specimens']>()

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const spec = data[rowIndex]
    const studyShortCode = (spec.studyShortCode as string | undefined) ?? fixedStudyShortCode ?? ''
    const subjectName = spec.subjectName as string
    const key = `${studyShortCode}:${subjectName}`
    if (!subjectMap.has(key)) {
      subjectMap.set(key, [])
    }

    const rawContainer = spec.container as FlatBulkImportContainer | undefined
    const containerData =
      rawContainer != null
        ? flatBulkContainerToWriteInput(rawContainer, collectionLocationMap)
        : undefined

    subjectMap.get(key)!.push({
      specimenTypeName: spec.specimenTypeName as string,
      collectionDate: spec.collectionDate as string | undefined,
      container: containerData,
      rowIndex: rowIndex + 1,
    })
  }

  const studyShortCode = fixedStudyShortCode ?? (data[0] ? (data[0].studyShortCode as string) : undefined) ?? ''

  const subjects = Array.from(subjectMap.entries()).map(([key, specimens]) => {
    const [, subjectName] = key.split(':') as [string, string]
    return {
      subjectName,
      specimens,
    }
  })

  return {
    studyShortCode,
    atomicMode: opts.atomicMode,
    subjects,
  }
}
