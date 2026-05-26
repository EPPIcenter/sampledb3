import { api } from './client'
import type { Location } from './types'

// Collection response types
interface MicronixPlateResponse {
  id: number
  name: string
  barcode?: string | null
  locationId: number
  location?: Location | null
  locationPath?: string | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface CryovialBoxResponse {
  id: number
  name: string
  barcode?: string | null
  locationId: number
  location?: Location | null
  locationPath?: string | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface BoxResponse {
  id: number
  name: string
  locationId: number
  location?: Location | null
  locationPath?: string | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface BagResponse {
  id: number
  name: string
  locationId: number
  location?: Location | null
  locationPath?: string | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface SheetResponse {
  id: number
  name: string
  boxId?: number | null
  bagId?: number | null
  location?: Location | null
  locationPath?: string | null
  box?: { id: number; name: string } | null
  bag?: { id: number; name: string } | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface WellEntry {
  type: 'micronix_tube' | 'static_well'
  id: number
  barcode?: string | null
  position?: string | null
  container?: unknown
}

interface CryovialTubeEntry {
  kind: 'cryovial_tube'
  id: number
  barcode?: string | null
  position?: string | null
  container?: unknown
}

interface PaperEntry {
  type: 'paper'
  id: number
  barcode?: string | null
  position?: string | null
  container?: unknown
}

export interface ValidatePlateScanResult {
  plate: { id: number; name: string }
  summary: {
    totalExpected: number
    matched: number
    missingInScan: number
    extraInScan: number
    mismatch: number
    exhaustedCount: number
    taggedCount: number
  }
  wells: Array<{
    position: string
    scanBarcode: string | null
    expectedBarcode: string | null
    status: 'match' | 'mismatch' | 'missing_in_scan' | 'extra_in_scan'
    exhausted: boolean
    tags: string[]
    /** When status is mismatch or extra_in_scan, where the scanned barcode is registered (plate + position). */
    scanBarcodeOrigin: { plateId: number; plateName: string; position: string } | null
  }>
  /** True when plate was inferred from scan barcodes (plateId was not sent). */
  inferredPlate?: boolean
}

/** Per-plate summary in inference report when a single plate cannot be inferred. */
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

/** Response from validate-scan: either validation result or inference report. */
export type ValidatePlateScanResponse =
  | ValidatePlateScanResult
  | { inferenceReport: InferenceReport }

export const collectionsApi = {
  getMicronixPlate: (id: number) =>
    api.get<{ plate: MicronixPlateResponse; wells: Record<string, WellEntry> }>(`/collections/plates/micronix/${id}`),
  getCryovialBox: (id: number) =>
    api.get<{ box: CryovialBoxResponse; positions: Record<string, CryovialTubeEntry[]> }>(`/collections/boxes/cryovial/${id}`),
  getBox: (id: number) =>
    api.get<{ box: BoxResponse; contents: { sheets: Array<SheetResponse & { papers: PaperEntry[] }> } }>(`/collections/boxes/${id}`),
  getBag: (id: number) =>
    api.get<{ bag: BagResponse; contents: { sheets: Array<SheetResponse & { papers: PaperEntry[] }> } }>(`/collections/bags/${id}`),
  getSheet: (id: number) =>
    api.get<{ sheet: SheetResponse; papers: PaperEntry[] }>(`/collections/sheets/${id}`),
  check: (data: { collections: Array<{ identifier: string; type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet' }> }) =>
    api.post<{ results: Array<{ identifier: string; type: string; exists: boolean; id: number | null }> }>('/collections/check', data),
  /** Resolve collection by name and type; returns found + id/location when existing (for batch creation). */
  resolve: (data: { name: string; type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box' }) =>
    api.post<{ found: boolean; id?: number; name?: string; type?: string; locationId?: number; locationName?: string }>('/collections/resolve', data),
  createMicronixPlate: (data: { name: string; locationId: number; barcode?: string }) =>
    api.post<{ plate: MicronixPlateResponse }>('/collections/plates/micronix', data),
  validatePlateScan: (data: { csvText: string; plateId?: number; scannerConfigurationId: string }) =>
    api.post<ValidatePlateScanResponse>('/collections/plates/micronix/validate-scan', data),
  createCryovialBox: (data: { name: string; locationId: number; barcode?: string }) =>
    api.post<{ box: CryovialBoxResponse }>('/collections/boxes/cryovial', data),
  createBox: (data: { name: string; locationId: number }) =>
    api.post<{ box: BoxResponse }>('/collections/boxes', data),
  createBag: (data: { name: string; locationId: number }) =>
    api.post<{ bag: BagResponse }>('/collections/bags', data),
  resolveContainers: (data: {
    identifiers: Array<
      | { type: 'barcode'; barcode: string }
      | { type: 'position'; sourceCollectionName: string; sourcePosition: string }
    >
  }) =>
    api.post<{ containers: Array<{ identifier: { type: string; value: string } | string; container: unknown }> }>('/collections/containers/resolve', data),
  listCollectionsByType: (type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet') =>
    api.get<{ collections: Array<{ id: number; name: string; locationId?: number | null; itemCount?: number; location?: { id: number; path: string | null } | null }> }>(`/collections/list/${type}`),
  listAllCollections: () =>
    api.get<{ collections: Array<{ id: number; name: string; type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'; barcode: string | null; locationId: number | null; itemCount: number; location: { id: number; path: string | null } | null }> }>('/collections/list-all'),
  moveContainers: (data: {
    collectionType?: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet'
    atomicMode?: 'all_or_nothing' | 'best_effort'
    mappings: Array<{
      fromCollectionName: string
      toCollectionName: string
    }>
    moves: Array<{
      identifier:
      | { type: 'barcode'; barcode: string }
      | { type: 'position'; sourceCollectionName: string; sourcePosition: string }
      | { type: 'container_id'; containerId: number }
      targetPosition?: string
    }>
  }) =>
    api.post<{ success: boolean; moved: number; errors?: Array<{ row: number; error: string }> }>(
      '/collections/containers/move',
      data
    ),
  moveSheets: (data: {
    sheetIds: number[]
    targetCollectionId: number
    targetCollectionType: 'box' | 'bag'
  }) => api.post<{ success: boolean; moved: number }>('/collections/sheets/move', data),
  moveCollections: (data: {
    collectionType: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
    atomicMode?: 'all_or_nothing' | 'best_effort'
    moves: Array<{
      identifier:
        | { type: 'id'; id: number }
        | { type: 'name'; name: string; locationId?: number; locationPath?: string }
        | { type: 'barcode'; barcode: string; locationId?: number; locationPath?: string }
      targetLocationId: number
    }>
  }) =>
    api.post<{ success: boolean; moved: number; errors?: Array<{ row: number; error: string }> }>(
      '/collections/move',
      data
    ),
  /** Remove a collection, all of its child containers, orphan specimens, and optionally empty study subjects. */
  deleteWithContents: (data: {
    collectionType: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
    id: number
    removeEmptySubjects?: boolean
  }) =>
    api.post<{
      containersDeleted: number
      specimensDeleted: number
      sheetsDeleted: number
      collectionDeleted: true
      subjectsDeleted: number
    }>('/collections/delete-with-contents', data),
}

export type CollectionDeleteWithContentsBlocker = {
  code: string
  message: string
} & {
  qpcrExperimentId?: number
  qpcrWellId?: number
  wellPosition?: string
  storageContainerId?: number
  specimenId?: number
  containerDerivationId?: number
  inCollectionContainerId?: number
  outsideContainerId?: number
  outsideRole?: 'parent' | 'child'
}

