/**
 * Build API payloads for bulk import in one place so validate and import stay aligned.
 */
import type { BulkCombinedRequest, BulkCombinedValidateRequest } from '@sampledb/contract'
import { getBulkImportCollectionType } from './bulk-import-validation'
import type { BulkCombinedAtomicMode } from './api/imports'
import type { ContainerType } from './container-types'

export interface MissingCollectionForPayload {
  name: string
  barcode?: string
  locationId: number | null
  collectionBarcode?: string
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

/** Same as POST /specimens/bulk: attach collectionLocationId for collections created in the wizard. */
export function buildSpecimensWithLocationIds(
  data: Record<string, unknown>[],
  collectionLocationMap: Map<string, number>
): Record<string, unknown>[] {
  return data.map((spec) => {
    if (!spec.container) return spec
    const container = spec.container as Record<string, unknown>
    const locationId = container.collectionName
      ? collectionLocationMap.get(container.collectionName as string)
      : container.collectionBarcode
        ? collectionLocationMap.get(container.collectionBarcode as string)
        : undefined
    if (locationId == null) return spec
    return {
      ...spec,
      container: { ...container, collectionLocationId: locationId },
    }
  })
}

export function buildCreateCollectionsForBulkCombined(params: {
  atomicMode: BulkCombinedAtomicMode
  missingCollections: MissingCollectionForPayload[]
  /** From getBulkImportCollectionType(containerType) */
  collectionApiType: ReturnType<typeof getBulkImportCollectionType>
}): BulkCombinedRequest['createCollections'] {
  const { atomicMode, missingCollections, collectionApiType } = params
  if (atomicMode !== 'full_file' || !collectionApiType) {
    return undefined
  }
  if (!missingCollections.some((c) => c.locationId != null)) {
    return undefined
  }
  return missingCollections
    .filter((c) => c.locationId != null)
    .map((c) => {
      const name =
        c.name || (c.barcode ? `Collection-${c.barcode}` : `Collection-${Date.now()}`)
      return {
        type: collectionApiType,
        name,
        locationId: c.locationId!,
        barcode: c.barcode ?? c.collectionBarcode,
      }
    })
}

/** Strip validate-only rowIndex before POST /imports/bulk-combined. */
export function toBulkCombinedImportRequest(
  payload: BulkCombinedValidateRequest
): BulkCombinedRequest {
  return {
    studyShortCode: payload.studyShortCode,
    atomicMode: payload.atomicMode,
    createCollections: payload.createCollections,
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
  const { fixedStudyShortCode, missingCollections, atomicMode, containerType } = opts
  const collectionLocationMap = buildCollectionLocationMap(missingCollections)
  const collectionApiType = getBulkImportCollectionType(containerType)

  const subjectMap = new Map<string, BulkCombinedValidateRequest['subjects'][number]['specimens']>()

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const spec = data[rowIndex]
    const studyShortCode = (spec.studyShortCode as string | undefined) ?? fixedStudyShortCode ?? ''
    const subjectName = spec.subjectName as string
    const key = `${studyShortCode}:${subjectName}`
    if (!subjectMap.has(key)) {
      subjectMap.set(key, [])
    }

    let containerData = spec.container as BulkCombinedValidateRequest['subjects'][number]['specimens'][number]['container']
    if (containerData && containerData.collectionName) {
      const locationId = collectionLocationMap.get(containerData.collectionName)
      if (locationId != null) {
        containerData = {
          ...containerData,
          collectionLocationId: locationId,
        }
      }
    } else if (containerData && containerData.collectionBarcode) {
      const locationId = collectionLocationMap.get(containerData.collectionBarcode)
      if (locationId != null) {
        containerData = {
          ...containerData,
          collectionLocationId: locationId,
        }
      }
    }

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

  const createCollections = buildCreateCollectionsForBulkCombined({
    atomicMode,
    missingCollections,
    collectionApiType,
  })

  return {
    studyShortCode,
    atomicMode,
    createCollections,
    subjects,
  }
}
