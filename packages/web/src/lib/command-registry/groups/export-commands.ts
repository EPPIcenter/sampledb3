import type { Command } from '../../commands'
import type { CommandDependencies } from '../command-deps'

export function buildExportCommands(d: CommandDependencies): Command[] {
  return [
    {
      id: 'export-barcodes',
      label: 'Open Barcode Export',
      category: 'Export',
      keywords: ['barcode', 'export', 'scan', 'barcodes'],
      description: 'Navigate to barcode export workflow',
      action: () => d.navigate('/barcode-export'),
    },
    {
      id: 'export-specimens',
      label: 'Download Specimens CSV',
      category: 'Export',
      keywords: ['export specimens', 'specimen csv', 'download specimens'],
      description: 'Download specimens as CSV',
      action: () => void d.handleExportSpecimens(),
    },
    {
      id: 'export-inventory',
      label: 'Download Inventory CSV',
      category: 'Export',
      keywords: ['export inventory', 'inventory csv', 'download inventory'],
      description: 'Download inventory as CSV',
      action: () => void d.handleExportInventory(),
    },
  ]
}
