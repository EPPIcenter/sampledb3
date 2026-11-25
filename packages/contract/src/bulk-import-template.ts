/**
 * Bulk import template column definitions and CSV-to-request mapping shared between the web
 * import flow and the API (ADR 0006).
 */
import type {
  BulkCombinedContainer,
  BulkCombinedRequest,
  BulkCombinedValidateRequest,
} from './bulk-combined'
import { parseCsvFileRows } from './csv'
import { PAPER_USE_SUBLABEL_NOT_BARCODE } from './paper-container-inbound'
import { csvRowToContainerWriteInput, type ContainerWriteType } from './write'

export type BulkImportContainerType = ContainerWriteType | 'none'

export type BulkImportCollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'

export type BulkImportColumnName =
  | 'study_short_code'
  | 'subject_name'
  | 'specimen_type_name'
  | 'collection_date'
  | 'plate_name'
  | 'box_name'
  | 'bag_name'
  | 'collection_barcode'
  | 'barcode'
  | 'position'
  | 'sheet_name'
  | 'sublabel'
  | 'comment'

export const BULK_IMPORT_BASE_TEMPLATE_COLUMNS = [
  'study_short_code',
  'subject_name',
  'specimen_type_name',
  'collection_date',
] as const satisfies readonly BulkImportColumnName[]

export const BULK_IMPORT_BASE_REQUIRED_COLUMNS = [
  'study_short_code',
  'subject_name',
  'specimen_type_name',
] as const satisfies readonly BulkImportColumnName[]

export const BULK_IMPORT_BASE_OPTIONAL_COLUMNS = [
  'collection_date',
] as const satisfies readonly BulkImportColumnName[]

/** Lowercase header aliases mapped to canonical template column names. */
export const BULK_IMPORT_HEADER_ALIASES: Readonly<Record<string, BulkImportColumnName>> = {
  well_position: 'position',
  well: 'position',
}

export interface BulkImportContainerTemplateDefinition {
  containerType: BulkImportContainerType
  /** Exact container column order in the downloadable CSV template (after base columns). */
  templateColumns: readonly BulkImportColumnName[]
  /** Required container columns for display/docs (paper uses 'box_name or bag_name'). */
  requiredFields: readonly string[]
  /** Optional container columns shown in UI/docs (excluding collection_date). */
  optionalFields: readonly BulkImportColumnName[]
  /** Additional accepted columns not included in the default template (e.g. collection_barcode). */
  acceptedExtraColumns: readonly BulkImportColumnName[]
  /** Physical Collection type(s) this container sits in (for paper, its sheet's parent box or bag). */
  collectionTypes: readonly BulkImportCollectionType[]
  /** Primary Collection name column, or null for 'none' and 'paper' (which accepts box_name or bag_name). */
  collectionNameColumn: 'plate_name' | 'box_name' | null
}

export const BULK_IMPORT_CONTAINER_TEMPLATES: Readonly<
  Record<BulkImportContainerType, BulkImportContainerTemplateDefinition>
> = {
  none: {
    containerType: 'none',
    templateColumns: [],
    requiredFields: [],
    optionalFields: [],
    acceptedExtraColumns: [],
    collectionTypes: [],
    collectionNameColumn: null,
  },
  micronix_tube: {
    containerType: 'micronix_tube',
    templateColumns: ['plate_name', 'barcode', 'position', 'comment'],
    requiredFields: ['plate_name', 'barcode', 'position'],
    optionalFields: ['comment'],
    acceptedExtraColumns: ['collection_barcode'],
    collectionTypes: ['micronix_plate'],
    collectionNameColumn: 'plate_name',
  },
  cryovial_tube: {
    containerType: 'cryovial_tube',
    templateColumns: ['box_name', 'barcode', 'position', 'comment'],
    requiredFields: ['box_name', 'position'],
    optionalFields: ['barcode', 'comment'],
    acceptedExtraColumns: ['collection_barcode'],
    collectionTypes: ['cryovial_box'],
    collectionNameColumn: 'box_name',
  },
  paper: {
    containerType: 'paper',
    templateColumns: ['box_name', 'bag_name', 'sheet_name', 'sublabel', 'comment'],
    requiredFields: ['box_name or bag_name', 'sheet_name'],
    optionalFields: ['sublabel', 'comment'],
    acceptedExtraColumns: [],
    collectionTypes: ['box', 'bag'],
    collectionNameColumn: null,
  },
  static_well: {
    containerType: 'static_well',
    templateColumns: ['plate_name', 'position', 'comment'],
    requiredFields: ['plate_name', 'position'],
    optionalFields: ['comment'],
    acceptedExtraColumns: ['collection_barcode'],
    collectionTypes: ['micronix_plate'],
    collectionNameColumn: 'plate_name',
  },
}

export function normalizeBulkImportHeader(header: string): string {
  const lower = header.trim().toLowerCase()
  return BULK_IMPORT_HEADER_ALIASES[lower] ?? lower
}

export function getBulkImportTemplateColumns(options: {
  containerType: BulkImportContainerType
  defaultStudyShortCode?: string
}): BulkImportColumnName[] {
  const base: BulkImportColumnName[] = options.defaultStudyShortCode
    ? ['subject_name', 'specimen_type_name', 'collection_date']
    : [...BULK_IMPORT_BASE_TEMPLATE_COLUMNS]
  return [...base, ...BULK_IMPORT_CONTAINER_TEMPLATES[options.containerType].templateColumns]
}

export function getBulkImportRequiredColumns(options: {
  containerType: BulkImportContainerType
  defaultStudyShortCode?: string
}): string[] {
  const base = options.defaultStudyShortCode
    ? ['subject_name', 'specimen_type_name']
    : [...BULK_IMPORT_BASE_REQUIRED_COLUMNS]
  return [...base, ...BULK_IMPORT_CONTAINER_TEMPLATES[options.containerType].requiredFields]
}

export function getBulkImportOptionalColumns(
  containerType: BulkImportContainerType,
): readonly BulkImportColumnName[] {
  return BULK_IMPORT_CONTAINER_TEMPLATES[containerType].optionalFields
}

export type BulkImportCsvRow = Record<string, string>

export interface ParsedBulkImportRow {
  row: BulkImportCsvRow
  /** 1-based spreadsheet row number (header is row 1; blank rows count). */
  fileRow: number
}

export interface ParsedBulkImportCsv {
  headers: string[]
  rows: ParsedBulkImportRow[]
}

/**
 * Parse bulk import CSV text into header-keyed rows with normalized headers and trimmed cell
 * values, dropping blank rows while preserving 1-based spreadsheet row numbers.
 */
export function parseBulkImportTemplateCsv(csvText: string): ParsedBulkImportCsv {
  const parsed = parseCsvFileRows(csvText)
  if (!parsed) return { headers: [], rows: [] }
  const headers = parsed.header.map(normalizeBulkImportHeader)
  const rows: ParsedBulkImportRow[] = parsed.rows.map(({ cells, fileRow }) => {
    const row: BulkImportCsvRow = {}
    headers.forEach((header, j) => {
      row[header] = cells[j]?.trim() ?? ''
    })
    return { row, fileRow }
  })
  return { headers, rows }
}

/** Physical Collection named by one or more rows of a template CSV. */
export interface BulkImportCollectionRef {
  type: BulkImportCollectionType
  name?: string
  barcode?: string
}

/** Caller-supplied Location and/or barcode for a Collection referenced by the CSV. */
export interface BulkImportCollectionOverride {
  type: BulkImportCollectionType
  name?: string
  barcode?: string
  locationId?: number | null
}

export interface BulkImportTemplateError {
  /** 1-based spreadsheet row number (header is row 1), omitted for file-wide errors. */
  rowIndex?: number
  /** Canonical template column name when the problem belongs to a column. */
  column?: BulkImportColumnName
  /** Offending cell value when applicable. */
  value?: string
  message: string
}

export interface MapBulkImportTemplateOptions {
  containerType: BulkImportContainerType
  /** Default Study short code for rows without a study_short_code value. */
  defaultStudyShortCode?: string
  /** Atomicity mode for the bulk combined request. Defaults to 'full_file'. */
  atomicMode?: BulkCombinedRequest['atomicMode']
  /** Locations and/or barcodes for Collections referenced by the file. */
  collections?: readonly BulkImportCollectionOverride[]
}

export type MapBulkImportTemplateResult =
  | {
      ok: true
      validateRequest: BulkCombinedValidateRequest
      importRequest: BulkCombinedRequest
      collections: BulkImportCollectionRef[]
      fileRows: number[]
    }
  | {
      ok: false
      errors: BulkImportTemplateError[]
      collections: BulkImportCollectionRef[]
      fileRows: number[]
    }

/** Strip validate-only rowIndex before POST /imports/bulk-combined. */
export function toBulkCombinedImportRequest(
  payload: BulkCombinedValidateRequest,
): BulkCombinedRequest {
  return {
    ...(payload.studyShortCode ? { studyShortCode: payload.studyShortCode } : {}),
    atomicMode: payload.atomicMode,
    subjects: payload.subjects.map(({ studyShortCode, subjectName, specimens }) => ({
      ...(studyShortCode ? { studyShortCode } : {}),
      subjectName,
      specimens: specimens.map(({ specimenTypeName, collectionDate, container }) => ({
        specimenTypeName,
        ...(collectionDate ? { collectionDate } : {}),
        ...(container ? { container } : {}),
      })),
    })),
  }
}

function trimCell(value: string | undefined): string {
  return (value ?? '').trim()
}

function collectionLookupKey(
  type: BulkImportCollectionType,
  kind: 'name' | 'barcode',
  value: string,
): string {
  return `${type}:${kind}:${value}`
}

function resolvePaperParent(
  row: BulkImportCsvRow,
): { type: 'box' | 'bag'; name: string } | { error: string } | undefined {
  const boxName = trimCell(row.box_name)
  const bagName = trimCell(row.bag_name)
  if (boxName && bagName) {
    return { error: 'Provide either box_name or bag_name, not both' }
  }
  if (boxName) return { type: 'box', name: boxName }
  if (bagName) return { type: 'bag', name: bagName }
  return undefined
}

/**
 * Extract the physical Collection a CSV row places its Container in.
 * `name` comes from the type-specific name column (plate_name, box_name, or bag_name) and
 * `barcode` from collection_barcode; values are never reclassified by their shape.
 */
export function getBulkImportRowCollectionRef(
  row: BulkImportCsvRow,
  containerType: BulkImportContainerType,
): BulkImportCollectionRef | undefined {
  if (containerType === 'none') return undefined
  if (containerType === 'paper') {
    const parent = resolvePaperParent(row)
    if (!parent || 'error' in parent) return undefined
    return { type: parent.type, name: parent.name }
  }
  const spec = BULK_IMPORT_CONTAINER_TEMPLATES[containerType]
  const type = spec.collectionTypes[0]
  if (!type) return undefined
  const name = spec.collectionNameColumn ? trimCell(row[spec.collectionNameColumn]) || undefined : undefined
  const barcode = trimCell(row.collection_barcode) || undefined
  if (!name && !barcode) return undefined
  return {
    type,
    ...(name ? { name } : {}),
    ...(barcode ? { barcode } : {}),
  }
}

export function mapBulkImportTemplateCsv(
  csvText: string,
  options: MapBulkImportTemplateOptions,
): MapBulkImportTemplateResult {
  const { containerType } = options
  const defaultStudy = trimCell(options.defaultStudyShortCode) || undefined
  const atomicMode = options.atomicMode ?? 'full_file'

  let parsed: ParsedBulkImportCsv
  try {
    parsed = parseBulkImportTemplateCsv(csvText)
  } catch (error) {
    return {
      ok: false,
      errors: [{ message: error instanceof Error ? error.message : 'Failed to parse CSV' }],
      collections: [],
      fileRows: [],
    }
  }

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      errors: [{ message: 'CSV file is empty or has no data rows' }],
      collections: [],
      fileRows: [],
    }
  }

  const fileRows = parsed.rows.map((r) => r.fileRow)
  const errors: BulkImportTemplateError[] = []

  // First pass: collect unique Collection references and check for conflicting collection_barcode values.
  const collectionRefsByKey = new Map<string, BulkImportCollectionRef>()
  const fileBarcodesByNameKey = new Map<string, { barcode: string; fileRow: number }>()

  if (containerType !== 'none') {
    for (const { row, fileRow } of parsed.rows) {
      const ref = getBulkImportRowCollectionRef(row, containerType)
      if (!ref) continue

      const dedupeKey = ref.name
        ? collectionLookupKey(ref.type, 'name', ref.name)
        : collectionLookupKey(ref.type, 'barcode', ref.barcode ?? '')
      const existingRef = collectionRefsByKey.get(dedupeKey)
      if (!existingRef) {
        collectionRefsByKey.set(dedupeKey, { ...ref })
      } else if (!existingRef.barcode && ref.barcode) {
        existingRef.barcode = ref.barcode
      }

      if (ref.name && ref.barcode) {
        const nameKey = collectionLookupKey(ref.type, 'name', ref.name)
        const first = fileBarcodesByNameKey.get(nameKey)
        if (!first) {
          fileBarcodesByNameKey.set(nameKey, { barcode: ref.barcode, fileRow })
        } else if (first.barcode !== ref.barcode) {
          errors.push({
            rowIndex: fileRow,
            column: 'collection_barcode',
            value: ref.barcode,
            message: `Collection '${ref.name}' has conflicting collection_barcode '${ref.barcode}' (row ${first.fileRow} has '${first.barcode}')`,
          })
        }
      }
    }
  }

  const collections = Array.from(collectionRefsByKey.values())

  // Index caller-supplied Collection overrides (locationId and/or barcode), keyed by Collection type.
  const locationByKey = new Map<string, number>()
  const overrideBarcodeByNameKey = new Map<string, string>()
  for (const override of options.collections ?? []) {
    const name = trimCell(override.name)
    const barcode = trimCell(override.barcode)
    if (override.locationId != null) {
      if (name) {
        locationByKey.set(collectionLookupKey(override.type, 'name', name), override.locationId)
      }
      if (barcode) {
        locationByKey.set(collectionLookupKey(override.type, 'barcode', barcode), override.locationId)
      }
    }
    if (barcode && name) {
      overrideBarcodeByNameKey.set(collectionLookupKey(override.type, 'name', name), barcode)
    }
  }

  const subjectMap = new Map<string, BulkCombinedValidateRequest['subjects'][number]>()

  for (const { row, fileRow } of parsed.rows) {
    let rowHasError = false
    const addRowError = (
      message: string,
      column?: BulkImportColumnName,
      value?: string,
    ) => {
      rowHasError = true
      errors.push({
        rowIndex: fileRow,
        ...(column ? { column } : {}),
        ...(value !== undefined ? { value } : {}),
        message,
      })
    }

    const studyShortCode = trimCell(row.study_short_code) || defaultStudy
    const subjectName = trimCell(row.subject_name)
    const specimenTypeName = trimCell(row.specimen_type_name)
    const collectionDate = trimCell(row.collection_date) || undefined

    if (!studyShortCode) {
      addRowError('Missing required value: study_short_code', 'study_short_code')
    }
    if (!subjectName) {
      addRowError('Missing required value: subject_name', 'subject_name')
    }
    if (!specimenTypeName) {
      addRowError('Missing required value: specimen_type_name', 'specimen_type_name')
    }

    let container: BulkCombinedContainer | undefined
    if (containerType !== 'none') {
      if (containerType === 'paper') {
        const parent = resolvePaperParent(row)
        if (!parent) {
          addRowError('Missing required value: box_name or bag_name', 'box_name')
        } else if ('error' in parent) {
          addRowError(parent.error, 'box_name')
        }
        if (!trimCell(row.sheet_name)) {
          addRowError('Missing required value: sheet_name', 'sheet_name')
        }
        const paperBarcode = trimCell(row.barcode)
        if (paperBarcode) {
          addRowError(PAPER_USE_SUBLABEL_NOT_BARCODE, 'barcode', paperBarcode)
        }
      } else {
        const nameCol = BULK_IMPORT_CONTAINER_TEMPLATES[containerType].collectionNameColumn ?? 'plate_name'
        if (!trimCell(row[nameCol]) && !trimCell(row.collection_barcode)) {
          addRowError(`Missing required value: ${nameCol} (or collection_barcode)`, nameCol)
        }
        if (containerType === 'micronix_tube' && !trimCell(row.barcode)) {
          addRowError('Missing required value: barcode', 'barcode')
        }
        if (!trimCell(row.position)) {
          addRowError('Missing required value: position', 'position')
        }
      }

      if (!rowHasError) {
        const ref = getBulkImportRowCollectionRef(row, containerType)
        const locationId = ref
          ? (ref.name ? locationByKey.get(collectionLookupKey(ref.type, 'name', ref.name)) : undefined) ??
            (ref.barcode ? locationByKey.get(collectionLookupKey(ref.type, 'barcode', ref.barcode)) : undefined)
          : undefined
        const effectiveCollectionBarcode =
          containerType === 'paper'
            ? undefined
            : ref?.barcode ??
              (ref?.name
                ? overrideBarcodeByNameKey.get(collectionLookupKey(ref.type, 'name', ref.name)) ??
                  fileBarcodesByNameKey.get(collectionLookupKey(ref.type, 'name', ref.name))?.barcode
                : undefined)

        const mapped = csvRowToContainerWriteInput(
          {
            container_type: containerType,
            plate_name: trimCell(row.plate_name) || undefined,
            box_name: trimCell(row.box_name) || undefined,
            bag_name: trimCell(row.bag_name) || undefined,
            collection_barcode: effectiveCollectionBarcode,
            barcode: trimCell(row.barcode) || undefined,
            position: trimCell(row.position) || undefined,
            sheet_name: trimCell(row.sheet_name) || undefined,
            sublabel: trimCell(row.sublabel) || undefined,
            comment: trimCell(row.comment) || undefined,
          },
          {
            defaultContainerType: containerType,
            requireSheetName: true,
            defaultLocationId: locationId,
          },
        )
        if (!mapped.success) {
          addRowError(mapped.error)
        } else {
          container = mapped.data
        }
      }
    }

    if (rowHasError || !studyShortCode || !subjectName || !specimenTypeName) continue

    const key = JSON.stringify([studyShortCode, subjectName])
    let subject = subjectMap.get(key)
    if (!subject) {
      subject = { studyShortCode, subjectName, specimens: [] }
      subjectMap.set(key, subject)
    }

    subject.specimens.push({
      specimenTypeName,
      ...(collectionDate ? { collectionDate } : {}),
      ...(container ? { container } : {}),
      rowIndex: fileRow,
    })
  }

  if (errors.length > 0) {
    errors.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0))
    return { ok: false, errors, collections, fileRows }
  }

  const validateRequest: BulkCombinedValidateRequest = {
    ...(defaultStudy ? { studyShortCode: defaultStudy } : {}),
    atomicMode,
    subjects: Array.from(subjectMap.values()),
  }

  return {
    ok: true,
    validateRequest,
    importRequest: toBulkCombinedImportRequest(validateRequest),
    collections,
    fileRows,
  }
}
