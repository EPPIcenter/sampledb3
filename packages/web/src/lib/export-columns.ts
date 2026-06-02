/**
 * Re-export container export column catalog from @sampledb/contract.
 */
export {
  EXPORT_ENTRY_COLUMNS,
  DEFAULT_EXPORT_COLUMN_KEYS,
  DEFAULT_TABLE_VIEW_COLUMN_KEYS,
  getExportColumnLabel,
  type ExportColumnDefinition,
} from '@sampledb/contract'

/** @deprecated Use ExportColumnDefinition from @sampledb/contract */
export type ExportEntryColumn = Pick<import('@sampledb/contract').ExportColumnDefinition, 'key' | 'label'>
