import type { BulkDerivationSettings } from './api'

export interface TemplateOptions {
  parentType: 'barcode' | 'control_batch' | 'study_subject' | 'cryovial_position'
  settings: BulkDerivationSettings
  sourceType?: 'control_batch' | 'study_subject'
  parentContainerType?: 'paper' | 'cryovial_tube' | 'micronix_tube'
}

export function generateDerivationsTemplate(options: TemplateOptions): string {
  const { parentType, settings, sourceType, parentContainerType } = options
  const lines: string[] = []

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
  } else if (parentType === 'cryovial_position') {
    // Study subject with cryovial parent (identified by box + position)
    parentColumns.push('parent_box_barcode')
    parentColumns.push('parent_position')
  }

  // Add optional override columns if defaults are set
  if (settings.quantity !== undefined) {
    parentColumns.push('quantity')
  }
  if (settings.unitSymbol) {
    parentColumns.push('unit_symbol')
  }
  if (settings.quantityUsed !== undefined) {
    parentColumns.push('quantity_used')
  }
  if (settings.reduceParentQuantity !== undefined) {
    parentColumns.push('reduce_parent_quantity')
  }

  // Always include per-row fields
  parentColumns.push('collection_name')
  parentColumns.push('position')
  parentColumns.push('container_barcode')
  parentColumns.push('notes')

  // Header row
  lines.push(parentColumns.join(','))

  // Helper to build example row matching column order
  const buildRow = (values: Record<string, string>): string => {
    return parentColumns.map(col => values[col] || '').join(',')
  }

  // Example rows based on parent type and container types
  if (parentType === 'control_batch') {
    // Control batch examples
    if (parentContainerType === 'paper') {
      // DBS on paper → extracting to derived container
      lines.push(buildRow({
        parent_control_batch_name: 'Batch-2024-001',
        parent_specimen_type_name: 'Whole Blood', // Example - user should use actual parent specimen type
        collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
        position: 'A01',
        container_barcode: 'CHILD001',
        notes: 'First extraction',
      }))
      lines.push(buildRow({
        parent_control_batch_name: 'Batch-2024-001',
        parent_specimen_type_name: 'Whole Blood',
        collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
        position: 'A02',
        container_barcode: 'CHILD002',
        notes: 'Second extraction',
      }))
    } else if (parentContainerType === 'cryovial_tube') {
      // Cryovial in control batch → extracting to derived container
      lines.push(buildRow({
        parent_control_batch_name: 'Batch-2024-001',
        parent_specimen_type_name: 'Whole Blood',
        parent_box_barcode: 'BOX-001',
        parent_position: 'A01',
        collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
        position: settings.containerType === 'cryovial_tube' ? 'B01' : 'A01',
        container_barcode: 'CHILD001',
        notes: 'First extraction',
      }))
      lines.push(buildRow({
        parent_control_batch_name: 'Batch-2024-001',
        parent_specimen_type_name: 'Whole Blood',
        parent_box_barcode: 'BOX-001',
        parent_position: 'A02',
        collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
        position: settings.containerType === 'cryovial_tube' ? 'B02' : 'A02',
        container_barcode: 'CHILD002',
        notes: 'Second extraction',
      }))
    }
  } else if (parentType === 'barcode') {
    // Study subject with micronix/cryovial parent (identified by barcode)
    lines.push(buildRow({
      parent_container_barcode: 'MT001',
      collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
      position: 'A01',
      container_barcode: 'CHILD001',
      notes: 'First extraction',
    }))
    lines.push(buildRow({
      parent_container_barcode: 'MT002',
      collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
      position: 'A02',
      container_barcode: 'CHILD002',
      notes: 'Second extraction',
    }))
  } else if (parentType === 'study_subject') {
    // Study subject with paper parent
    lines.push(buildRow({
      parent_study_short_code: 'TCC08',
      parent_subject_name: 'SUBJ-001',
      parent_specimen_type_name: 'Whole Blood', // Example - user should use actual parent specimen type
      parent_collection_date: '2024-01-15', // Optional: only needed if subject has multiple specimens of same type
      collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
      position: 'A01',
      container_barcode: 'CHILD001',
      notes: 'First extraction',
    }))
    lines.push(buildRow({
      parent_study_short_code: 'TCC08',
      parent_subject_name: 'SUBJ-002',
      parent_specimen_type_name: 'Whole Blood',
      parent_collection_date: '', // Can be empty if not needed
      collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
      position: 'A02',
      container_barcode: 'CHILD002',
      notes: 'Second extraction',
    }))
  } else if (parentType === 'cryovial_position') {
    // Study subject with cryovial parent (identified by box + position)
    lines.push(buildRow({
      parent_box_barcode: 'BOX-001',
      parent_position: 'A01',
      collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
      position: settings.containerType === 'cryovial_tube' ? 'B01' : 'A01',
      container_barcode: 'CHILD001',
      notes: 'First extraction',
    }))
    lines.push(buildRow({
      parent_box_barcode: 'BOX-001',
      parent_position: 'A02',
      collection_name: settings.containerType === 'paper' ? 'Sheet-001' : 'Plate-001',
      position: settings.containerType === 'cryovial_tube' ? 'B02' : 'A02',
      container_barcode: 'CHILD002',
      notes: 'Second extraction',
    }))
  }

  // Add comments explaining the template
  const comments: string[] = []
  comments.push('# Bulk Derivation Import Template')
  comments.push('#')
  comments.push('# Required fields (set in Step 1, not in CSV):')
  comments.push(`#   - derivation_type: ${settings.derivationType}`)
  comments.push(`#   - specimen_type_name: ${settings.specimenTypeName}`)
  comments.push(`#   - container_type: ${settings.containerType}`)
  comments.push(`#   - protocol: ${settings.protocol}`)
  comments.push(`#   - derivation_date: ${settings.derivationDate}`)
  comments.push('#')
  if (settings.quantity !== undefined || settings.unitSymbol || settings.quantityUsed !== undefined || settings.reduceParentQuantity !== undefined) {
    comments.push('# Default fields (can override in CSV):')
    if (settings.quantity !== undefined) {
      comments.push(`#   - quantity: ${settings.quantity} (leave empty to use default)`)
    }
    if (settings.unitSymbol) {
      comments.push(`#   - unit_symbol: ${settings.unitSymbol} (leave empty to use default)`)
    }
    if (settings.quantityUsed !== undefined) {
      comments.push(`#   - quantity_used: ${settings.quantityUsed} (leave empty to use default)`)
    }
    if (settings.reduceParentQuantity !== undefined) {
      comments.push(`#   - reduce_parent_quantity: ${settings.reduceParentQuantity} (leave empty to use default)`)
    }
  }
  comments.push('#')
  comments.push('# Per-row fields (can vary per row):')
  if (parentType === 'study_subject' && parentContainerType === 'paper') {
    comments.push('#   - parent_collection_date: Optional - only needed if subject has multiple specimens of same type')
  }
  comments.push('#   - collection_name: Collection name (will be created if doesn\'t exist)')
  comments.push('#   - position: Position in collection')
  comments.push('#   - container_barcode: Barcode for derived container')
  comments.push('#   - notes: Per-row notes')
  comments.push('#')
  if (parentType === 'control_batch' || parentType === 'study_subject') {
    comments.push('# Note: parent_specimen_type_name should be the SPECIMEN TYPE OF THE PARENT, not the derived specimen type.')
    comments.push('#       The derived specimen type is set in Step 1 settings.')
  }
  comments.push('#')
  comments.push('# Replace example data below with your actual data')

  return comments.join('\n') + '\n\n' + lines.join('\n')
}
