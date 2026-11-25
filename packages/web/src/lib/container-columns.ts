import { BULK_IMPORT_CONTAINER_TEMPLATES } from '@sampledb/contract'
import type { ContainerType } from './container-types'

export type CollectionNameColumn = 'plate_name' | 'box_name' | 'bag_name'

/**
 * Container types that have a collection name column (excludes 'none' and empty).
 */
export type ContainerTypeWithCollection = ContainerType | ''

/**
 * Return the CSV column name used for the collection (plate/box/bag) for the given container type.
 * Returns null for 'none' or empty string.
 */
export function getCollectionNameColumn(
  containerType: ContainerType | 'none' | ''
): CollectionNameColumn | null {
  switch (containerType) {
    case 'cryovial_tube':
      return 'box_name'
    case 'paper':
      return 'bag_name'
    case 'micronix_tube':
    case 'static_well':
    case '':
      return 'plate_name'
    case 'none':
    default:
      return null
  }
}

/**
 * Return the comma-separated container columns for the Bulk Import template (specimens/combined).
 * Reads from the contract package's template definitions.
 */
export function getContainerColumnsForBulkImport(containerType: ContainerType): string {
  return BULK_IMPORT_CONTAINER_TEMPLATES[containerType].templateColumns.join(',')
}
