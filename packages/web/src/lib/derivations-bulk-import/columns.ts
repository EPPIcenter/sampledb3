import type { BulkDerivationSettings } from '../api/derivations'
import type { TemplateOptions } from '../template-generator'
import type { ParentContainerType, SourceType } from './types'

/** Template parent-type for the source/parent-container combination. */
export function resolveTemplateParentType(
  sourceType: SourceType,
  parentContainerType: ParentContainerType,
): TemplateOptions['parentType'] {
  if (sourceType === 'control_batch') return 'control_batch'
  if (parentContainerType === 'paper') return 'study_subject'
  if (parentContainerType === 'cryovial_tube') return 'cryovial_position'
  return 'barcode'
}

/** Required and optional CSV columns for the current source, parent type, and settings. */
export function getRequiredAndOptionalColumns(
  sourceType: SourceType,
  parentContainerType: ParentContainerType,
  settings: BulkDerivationSettings,
): { required: string[]; optional: string[] } {
  const required: string[] = []
  const optional: string[] = []

  if (sourceType === 'control_batch') {
    required.push('parent_control_batch_name', 'parent_specimen_type_name')
    if (parentContainerType === 'cryovial_tube') {
      required.push('parent_box_barcode', 'parent_position')
    }
  } else {
    if (parentContainerType === 'paper') {
      required.push('parent_study_short_code', 'parent_subject_name', 'parent_specimen_type_name')
      optional.push('parent_collection_date')
    } else if (parentContainerType === 'cryovial_tube') {
      required.push('parent_box_barcode', 'parent_position')
    } else {
      required.push('parent_container_barcode')
    }
  }

  if (!settings.derivationType) required.push('derivation_type')
  if (!settings.specimenTypeName) required.push('specimen_type_name')
  if (!settings.containerType) required.push('container_type')
  if (!settings.protocol) required.push('protocol')
  if (!settings.derivationDate) required.push('derivation_date')

  const fixedContainerType = settings.containerType
  if (fixedContainerType === 'micronix_tube') {
    required.push('plate_name or collection_barcode')
    required.push('position')
    optional.push('container_barcode')
  } else if (fixedContainerType === 'cryovial_tube') {
    required.push('box_name or collection_barcode')
    required.push('position')
    optional.push('container_barcode')
  } else if (fixedContainerType === 'paper') {
    required.push('box_name or bag_name')
    required.push('sheet_name')
    optional.push('sublabel')
  } else {
    required.push('plate_name / box_name / bag_name (depends on container_type)')
    required.push('position')
    optional.push('collection_barcode')
    optional.push('container_barcode')
    optional.push('sublabel')
    optional.push('sheet_name')
  }
  optional.push('notes')

  if (settings.quantity === undefined) optional.push('quantity')
  if (!settings.unitSymbol) optional.push('unit_symbol')
  if (settings.quantityUsed === undefined) optional.push('quantity_used')
  if (settings.reduceParentQuantity === undefined) optional.push('reduce_parent_quantity')

  return { required, optional }
}
