import type { BulkDerivationSettings } from './api'
import { buildCsv } from './csv'
import { getCollectionNameColumn } from './container-columns'

export interface TemplateOptions {
  parentType: 'barcode' | 'control_batch' | 'study_subject' | 'cryovial_position'
  settings: BulkDerivationSettings
  sourceType?: 'control_batch' | 'study_subject'
  parentContainerType?: 'paper' | 'cryovial_tube' | 'micronix_tube'
  /** Specimen types from API; first is used for specimen_type_name defaults and example rows when provided. */
  specimenTypes?: Array<{ id: number; name: string }>
  /** Example derivation type for default/example row when column is included (e.g. from UI or DB). */
  exampleDerivationType?: string
  /** Example protocol for default/example row when column is included (e.g. from UI or DB). */
  exampleProtocol?: string
}

export function generateDerivationsTemplate(options: TemplateOptions): string {
  const { parentType, settings, sourceType, parentContainerType, specimenTypes, exampleDerivationType, exampleProtocol } = options
  const derivedContainerType = settings.containerType || 'micronix_tube'
  const exampleSpecimenTypeName = specimenTypes?.[0]?.name
  const parentExampleSpecimenType = exampleSpecimenTypeName ?? 'Whole Blood'
  const derivedExampleSpecimenType = exampleSpecimenTypeName ?? 'DNA (DBS)'
  const exampleDerivation = exampleDerivationType ?? 'dna_extraction'
  const exampleProtocolVal = exampleProtocol ?? 'Extraction v1'

  const collectionNameColumn = getCollectionNameColumn(derivedContainerType) ?? 'plate_name'
  const defaultCollectionName =
    derivedContainerType === 'cryovial_tube'
      ? 'BOX-001'
      : derivedContainerType === 'paper'
        ? 'BAG-001'
        : 'PLATE-001'

  // Determine parent identification columns based on source type and parent container type
  const parentColumns: string[] = []
  
  if (parentType === 'barcode') {
    // Study subject with micronix/cryovial parent (identified by barcode)
    parentColumns.push('parent_container_barcode')
  } else if (parentType === 'control_batch') {
    // Control batch workflow
    parentColumns.push('parent_control_batch_name')
    parentColumns.push('parent_specimen_type_name')
    // If parent is cryovial, need box and position
    if (parentContainerType === 'cryovial_tube') {
      parentColumns.push('parent_box_barcode')
      parentColumns.push('parent_position')
    }
  } else if (parentType === 'study_subject') {
    // Study subject with paper parent
    parentColumns.push('parent_study_short_code')
    parentColumns.push('parent_subject_name')
    parentColumns.push('parent_specimen_type_name')
    parentColumns.push('parent_collection_date') // Optional but included for clarity
  } else if (parentType === 'cryovial_position') { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    // Study subject with cryovial parent (identified by box + position)
    parentColumns.push('parent_box_barcode')
    parentColumns.push('parent_position')
  }

  // When a setting is empty, include it as a CSV column so user can supply per row (makes Import settings optional)
  if (!settings.derivationType) parentColumns.push('derivation_type')
  if (!settings.specimenTypeName) parentColumns.push('specimen_type_name')
  if (!settings.containerType) parentColumns.push('container_type')
  if (!settings.protocol) parentColumns.push('protocol')
  if (!settings.derivationDate) parentColumns.push('derivation_date')

  // Always include per-row fields
  parentColumns.push(collectionNameColumn)
  parentColumns.push('position')
  parentColumns.push('container_barcode')
  parentColumns.push('notes')
  // Quantity fields: include only when not set in Import settings (so same-for-all can be set in form)
  // Unit is not included in template; backend uses default unit for the derived container type.
  if (settings.quantity === undefined && !parentColumns.includes('quantity')) parentColumns.push('quantity')
  if (settings.quantityUsed === undefined && !parentColumns.includes('quantity_used')) parentColumns.push('quantity_used')
  if (settings.reduceParentQuantity === undefined && !parentColumns.includes('reduce_parent_quantity')) parentColumns.push('reduce_parent_quantity')

  // Default values for per-row columns when they're in the template (user didn't set "Apply to all rows")
  const defaultDerivationPerRow: Record<string, string> = {}
  if (parentColumns.includes('derivation_type')) defaultDerivationPerRow.derivation_type = exampleDerivation
  if (parentColumns.includes('specimen_type_name')) defaultDerivationPerRow.specimen_type_name = derivedExampleSpecimenType
  if (parentColumns.includes('container_type')) defaultDerivationPerRow.container_type = settings.containerType || 'micronix_tube'
  if (parentColumns.includes('protocol')) defaultDerivationPerRow.protocol = exampleProtocolVal
  if (parentColumns.includes('derivation_date')) defaultDerivationPerRow.derivation_date = new Date().toISOString().split('T')[0]
  if (parentColumns.includes('quantity')) defaultDerivationPerRow.quantity = '1'
  if (parentColumns.includes('quantity_used')) defaultDerivationPerRow.quantity_used = '1'
  if (parentColumns.includes('reduce_parent_quantity')) defaultDerivationPerRow.reduce_parent_quantity = 'true'

  const buildRow = (values: Record<string, string>): (string | null)[] =>
    parentColumns.map((col) => defaultDerivationPerRow[col] ?? values[col])

  const rows: (string | null)[][] = []

  if (parentType === 'control_batch') {
    if (parentContainerType === 'paper') {
      rows.push(buildRow({
        parent_control_batch_name: 'Batch-2024-001',
        parent_specimen_type_name: parentExampleSpecimenType,
        [collectionNameColumn]: defaultCollectionName,
        position: 'A01',
        container_barcode: 'CHILD001',
        notes: 'First extraction',
      }))
      rows.push(buildRow({
        parent_control_batch_name: 'Batch-2024-001',
        parent_specimen_type_name: parentExampleSpecimenType,
        [collectionNameColumn]: defaultCollectionName,
        position: 'A02',
        container_barcode: 'CHILD002',
        notes: 'Second extraction',
      }))
    } else if (parentContainerType === 'cryovial_tube') {
      rows.push(buildRow({
        parent_control_batch_name: 'Batch-2024-001',
        parent_specimen_type_name: parentExampleSpecimenType,
        parent_box_barcode: 'BOX-001',
        parent_position: 'A01',
        [collectionNameColumn]: defaultCollectionName,
        position: settings.containerType === 'cryovial_tube' ? 'B01' : 'A01',
        container_barcode: 'CHILD001',
        notes: 'First extraction',
      }))
      rows.push(buildRow({
        parent_control_batch_name: 'Batch-2024-001',
        parent_specimen_type_name: parentExampleSpecimenType,
        parent_box_barcode: 'BOX-001',
        parent_position: 'A02',
        [collectionNameColumn]: defaultCollectionName,
        position: settings.containerType === 'cryovial_tube' ? 'B02' : 'A02',
        container_barcode: 'CHILD002',
        notes: 'Second extraction',
      }))
    }
  } else if (parentType === 'barcode') {
    rows.push(buildRow({
      parent_container_barcode: 'MT001',
      [collectionNameColumn]: defaultCollectionName,
      position: 'A01',
      container_barcode: 'CHILD001',
      notes: 'First extraction',
    }))
    rows.push(buildRow({
      parent_container_barcode: 'MT002',
      [collectionNameColumn]: defaultCollectionName,
      position: 'A02',
      container_barcode: 'CHILD002',
      notes: 'Second extraction',
    }))
  } else if (parentType === 'study_subject') {
    rows.push(buildRow({
      parent_study_short_code: 'TCC08',
      parent_subject_name: 'SUBJ-001',
      parent_specimen_type_name: parentExampleSpecimenType,
      parent_collection_date: '2024-01-15',
      [collectionNameColumn]: defaultCollectionName,
      position: 'A01',
      container_barcode: 'CHILD001',
      notes: 'First extraction',
    }))
    rows.push(buildRow({
      parent_study_short_code: 'TCC08',
      parent_subject_name: 'SUBJ-002',
      parent_specimen_type_name: parentExampleSpecimenType,
      parent_collection_date: '',
      [collectionNameColumn]: defaultCollectionName,
      position: 'A02',
      container_barcode: 'CHILD002',
      notes: 'Second extraction',
    }))
  } else if (parentType === 'cryovial_position') { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    rows.push(buildRow({
      parent_box_barcode: 'BOX-001',
      parent_position: 'A01',
      [collectionNameColumn]: defaultCollectionName,
      position: settings.containerType === 'cryovial_tube' ? 'B01' : 'A01',
      container_barcode: 'CHILD001',
      notes: 'First extraction',
    }))
    rows.push(buildRow({
      parent_box_barcode: 'BOX-001',
      parent_position: 'A02',
      [collectionNameColumn]: defaultCollectionName,
      position: settings.containerType === 'cryovial_tube' ? 'B02' : 'A02',
      container_barcode: 'CHILD002',
      notes: 'Second extraction',
    }))
  }

  return buildCsv(parentColumns, rows)
}
