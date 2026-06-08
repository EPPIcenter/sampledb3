import { containerWriteInputSchema, type ContainerWriteInput } from './container-write-input'

export type ContainerCsvRow = Record<string, string | undefined>

export type CsvToContainerWriteInputOptions = {
  defaultContainerType?: ContainerWriteInput['containerType']
  requireSheetName?: boolean
  defaultLocationId?: number
}

type ParseResult =
  | { success: true; data: ContainerWriteInput }
  | { success: false; error: string }

function trim(value: string | undefined): string | undefined {
  const t = value?.trim()
  return t || undefined
}

function resolveContainerType(
  row: ContainerCsvRow,
  options: CsvToContainerWriteInputOptions,
): ContainerWriteInput['containerType'] | undefined {
  const raw = trim(row.container_type) ?? trim(row.containerType) ?? options.defaultContainerType
  if (!raw) return undefined
  if (
    raw === 'micronix_tube' ||
    raw === 'cryovial_tube' ||
    raw === 'paper' ||
    raw === 'static_well'
  ) {
    return raw
  }
  return undefined
}

function parseLocationId(
  row: ContainerCsvRow,
  options: CsvToContainerWriteInputOptions,
): number | undefined {
  const raw = trim(row.location_id) ?? trim(row.collection_location_id)
  if (raw) {
    const n = Number(raw)
    if (!Number.isInteger(n)) return undefined
    return n
  }
  return options.defaultLocationId
}

export function csvRowToContainerWriteInput(
  row: ContainerCsvRow,
  options: CsvToContainerWriteInputOptions = {},
): ParseResult {
  const containerType = resolveContainerType(row, options)
  if (!containerType) {
    return { success: false, error: 'container_type is required' }
  }

  const comment = trim(row.comment)
  const locationId = parseLocationId(row, options)

  if (containerType === 'micronix_tube') {
    const barcode = trim(row.barcode)
    if (!barcode) {
      return { success: false, error: 'barcode is required for micronix_tube' }
    }
    const plateName = trim(row.plate_name)
    const collectionBarcode = trim(row.collection_barcode)
    if (!plateName && !collectionBarcode) {
      return { success: false, error: 'plate_name or collection_barcode is required for micronix_tube' }
    }
    const mapped = {
      containerType: 'micronix_tube' as const,
      barcode,
      ...(comment ? { comment } : {}),
      collection: {
        type: 'micronix_plate' as const,
        ...(plateName ? { name: plateName } : {}),
        ...(collectionBarcode ? { barcode: collectionBarcode } : {}),
        ...(trim(row.position) ? { position: trim(row.position) } : {}),
        ...(locationId != null ? { locationId } : {}),
      },
    }
    const parsed = containerWriteInputSchema.safeParse(mapped)
    return parsed.success
      ? { success: true, data: parsed.data }
      : { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid micronix_tube input' }
  }

  if (containerType === 'cryovial_tube') {
    const boxName = trim(row.box_name)
    const collectionBarcode = trim(row.collection_barcode)
    if (!boxName && !collectionBarcode) {
      return { success: false, error: 'box_name or collection_barcode is required for cryovial_tube' }
    }
    const mapped = {
      containerType: 'cryovial_tube' as const,
      ...(trim(row.barcode) ? { barcode: trim(row.barcode) } : {}),
      ...(comment ? { comment } : {}),
      collection: {
        type: 'cryovial_box' as const,
        ...(boxName ? { name: boxName } : {}),
        ...(collectionBarcode ? { barcode: collectionBarcode } : {}),
        ...(trim(row.position) ? { position: trim(row.position) } : {}),
        ...(locationId != null ? { locationId } : {}),
      },
    }
    const parsed = containerWriteInputSchema.safeParse(mapped)
    return parsed.success
      ? { success: true, data: parsed.data }
      : { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid cryovial_tube input' }
  }

  if (containerType === 'static_well') {
    const plateName = trim(row.plate_name)
    const collectionBarcode = trim(row.collection_barcode)
    if (!plateName && !collectionBarcode) {
      return { success: false, error: 'plate_name or collection_barcode is required for static_well' }
    }
    const mapped = {
      containerType: 'static_well' as const,
      ...(comment ? { comment } : {}),
      collection: {
        type: 'micronix_plate' as const,
        ...(plateName ? { name: plateName } : {}),
        ...(collectionBarcode ? { barcode: collectionBarcode } : {}),
        ...(trim(row.position) ? { position: trim(row.position) } : {}),
        ...(locationId != null ? { locationId } : {}),
      },
    }
    const parsed = containerWriteInputSchema.safeParse(mapped)
    return parsed.success
      ? { success: true, data: parsed.data }
      : { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid static_well input' }
  }

  if (containerType === 'paper') {
    const boxName = trim(row.box_name)
    const bagName = trim(row.bag_name)
    if (boxName && bagName) {
      return { success: false, error: 'Provide either box_name or bag_name, not both' }
    }
    if (!boxName && !bagName) {
      return { success: false, error: 'box_name or bag_name is required for paper' }
    }
    const sheetName = trim(row.sheet_name)
    if (!sheetName && options.requireSheetName) {
      return { success: false, error: 'sheet_name is required for paper' }
    }
    if (trim(row.barcode)) {
      return { success: false, error: 'Paper containers use sublabel for spot identifiers, not barcode' }
    }
    const mapped = {
      containerType: 'paper' as const,
      ...(trim(row.sublabel) ? { sublabel: trim(row.sublabel) } : {}),
      ...(comment ? { comment } : {}),
      ...(sheetName || boxName || bagName
        ? {
            collection: {
              type: 'sheet' as const,
              ...(sheetName ? { name: sheetName } : {}),
              parent: boxName
                ? {
                    type: 'box' as const,
                    name: boxName,
                    ...(locationId != null ? { locationId } : {}),
                  }
                : {
                    type: 'bag' as const,
                    name: bagName!,
                    ...(locationId != null ? { locationId } : {}),
                  },
            },
          }
        : {}),
    }
    const parsed = containerWriteInputSchema.safeParse(mapped)
    return parsed.success
      ? { success: true, data: parsed.data }
      : { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid paper input' }
  }

  return { success: false, error: `Unsupported container type: ${containerType}` }
}
