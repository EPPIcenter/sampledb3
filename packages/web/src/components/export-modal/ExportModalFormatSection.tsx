interface ExportModalFormatSectionProps {
  exportFormat: 'csv' | 'xlsx' | 'json'
  csvDelimiter: ',' | ';' | '\t'
  csvBOM: boolean
  csvLineEnding: 'LF' | 'CRLF'
  onExportFormatChange: (format: 'csv' | 'xlsx' | 'json') => void
  onCsvDelimiterChange: (delimiter: ',' | ';' | '\t') => void
  onCsvBOMChange: (bom: boolean) => void
  onCsvLineEndingChange: (lineEnding: 'LF' | 'CRLF') => void
}

export default function ExportModalFormatSection({
  exportFormat,
  csvDelimiter,
  csvBOM,
  csvLineEnding,
  onExportFormatChange,
  onCsvDelimiterChange,
  onCsvBOMChange,
  onCsvLineEndingChange,
}: ExportModalFormatSectionProps) {
  return (
    <>
      <div className="mb-6">
        <label className="block text-sm font-medium text-app-text mb-2">Export Format</label>
        <div className="flex gap-4">
          {(['csv', 'xlsx', 'json'] as const).map((format) => (
            <label key={format} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="exportFormat"
                value={format}
                checked={exportFormat === format}
                onChange={() => onExportFormatChange(format)}
                className="text-app-accent focus:ring-app-accent"
              />
              <span className="text-sm text-app-text uppercase">{format}</span>
            </label>
          ))}
        </div>
      </div>

      {exportFormat === 'csv' && (
        <div className="mb-6 p-4 bg-app-surface rounded-lg border border-app-border">
          <h3 className="text-sm font-medium text-app-text mb-3">CSV Options</h3>

          <div className="mb-4">
            <label className="block text-sm font-medium text-app-text mb-2">Delimiter</label>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="csvDelimiter"
                  value=","
                  checked={csvDelimiter === ','}
                  onChange={() => onCsvDelimiterChange(',')}
                  className="text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text">Comma (,)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="csvDelimiter"
                  value=";"
                  checked={csvDelimiter === ';'}
                  onChange={() => onCsvDelimiterChange(';')}
                  className="text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text">Semicolon (;)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="csvDelimiter"
                  value="\t"
                  checked={csvDelimiter === '\t'}
                  onChange={() => onCsvDelimiterChange('\t')}
                  className="text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text">Tab</span>
              </label>
            </div>
          </div>

          <div className="mb-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={csvBOM}
                onChange={(e) => onCsvBOMChange(e.target.checked)}
                className="text-app-accent focus:ring-app-accent"
              />
              <span className="text-sm text-app-text">Include UTF-8 BOM (recommended for Excel)</span>
            </label>
            <p className="mt-1 text-xs text-app-text-muted ml-6">
              Helps Excel recognize UTF-8 encoding automatically
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-app-text mb-2">Line Ending</label>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="csvLineEnding"
                  value="CRLF"
                  checked={csvLineEnding === 'CRLF'}
                  onChange={() => onCsvLineEndingChange('CRLF')}
                  className="text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text">CRLF (Windows, recommended for Excel)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="csvLineEnding"
                  value="LF"
                  checked={csvLineEnding === 'LF'}
                  onChange={() => onCsvLineEndingChange('LF')}
                  className="text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text">LF (Unix)</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
