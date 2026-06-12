import { Link } from 'react-router-dom'
import type { ScannerConfiguration } from '../../lib/api/settings'

interface MicronixScannerConfigPanelProps {
  scannerConfigurations: ScannerConfiguration[]
  selectedConfigId: string | null
  onConfigChange: (configId: string) => void
}

export default function MicronixScannerConfigPanel({
  scannerConfigurations,
  selectedConfigId,
  onConfigChange,
}: MicronixScannerConfigPanelProps) {
  const selectedConfig = scannerConfigurations.find((c) => c.id === selectedConfigId)

  return (
    <>
      <div className="mb-4">
        <label className="block text-sm font-medium text-app-text mb-2">Scanner Configuration *</label>
        {scannerConfigurations.length > 0 ? (
          <>
            <select
              value={selectedConfigId || ''}
              onChange={(e) => onConfigChange(e.target.value)}
              required
              className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
            >
              {scannerConfigurations.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}{config.isDefault ? ' (Default)' : ''}
                </option>
              ))}
            </select>
            {selectedConfig && (
              <p className="text-xs text-app-text-muted mt-1">
                Barcode: {selectedConfig.barcodeColumn}
                {selectedConfig.positionType === 'single' && `, Position: ${selectedConfig.positionColumn}`}
                {selectedConfig.positionType === 'combined' &&
                  `, Row: ${selectedConfig.rowColumn}, Column: ${selectedConfig.columnColumn} (auto-padded)`}
                {selectedConfig.skipRows > 0 && `, Skip: ${selectedConfig.skipRows} rows`}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-app-text-muted italic">
            No scanner configurations available. Please configure them in{' '}
            <Link to="/settings?tab=scanner-configurations" className="text-app-accent hover:text-app-accent-hover underline">
              Settings → Scanner Configurations
            </Link>.
          </p>
        )}
      </div>

      {!selectedConfigId && scannerConfigurations.length > 0 && (
        <p className="text-sm text-amber-600 mb-2">Please select a scanner configuration before uploading files.</p>
      )}

      {selectedConfig?.plateNameSource === 'column' && selectedConfig.plateNameColumn?.trim() && (
        <p className="text-sm text-app-text-muted mb-2 border-l-2 border-app-accent/40 pl-3">
          Destination plate is read from column{' '}
          <span className="font-mono text-app-accent">{selectedConfig.plateNameColumn.trim()}</span>. Every row must use the same plate name.
        </p>
      )}
    </>
  )
}
