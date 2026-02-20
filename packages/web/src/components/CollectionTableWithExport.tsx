import { buildCsv, downloadCsv } from '../lib/csv'

export interface CollectionTableColumn {
  key: string
  label: string
}

export interface CollectionTableWithExportProps {
  columns: CollectionTableColumn[]
  rows: Record<string, string | number | null>[]
  exportFilename: string
  className?: string
}

export default function CollectionTableWithExport({
  columns,
  rows,
  exportFilename,
  className,
}: CollectionTableWithExportProps) {
  const handleExportCsv = () => {
    const header = columns.map((c) => c.label)
    const rowArrays = rows.map((row) => columns.map((col) => row[col.key] ?? ''))
    const csv = buildCsv(header, rowArrays, { bom: true })
    downloadCsv(csv, exportFilename)
  }

  return (
    <div className={className}>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={handleExportCsv}
          className="px-3 py-1.5 text-sm border rounded-md border-gray-300 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
          style={{ color: 'rgb(var(--dashboard-text))' }}
        >
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="storage-grid-table min-w-full border-collapse text-xs md:text-sm">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="border border-gray-100 bg-gray-50 px-2 py-1 text-left text-[11px] font-semibold text-gray-600"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="border border-gray-100 px-2 py-1 align-top"
                  >
                    {row[col.key] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
