import React from 'react'

interface CollectionGridProps<T> {
  rows: string[]
  columns: string[]
  getKey: (row: string, column: string) => string
  getCell: (row: string, column: string) => T | T[] | null | undefined
  renderCell: (value: T | T[] | null | undefined, coords: { row: string; column: string }) => React.ReactNode
  className?: string
  /** When "storage", applies storage-grid-table for lab-themed borders/header inside .storage-page */
  theme?: 'default' | 'storage'
}

export default function CollectionGrid<T>({
  rows,
  columns,
  getKey,
  getCell,
  renderCell,
  className,
  theme = 'default',
}: CollectionGridProps<T>) {
  const tableClassName =
    theme === 'storage'
      ? 'storage-grid-table min-w-full border-collapse text-xs md:text-sm'
      : 'min-w-full border-collapse text-xs md:text-sm'

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className={tableClassName}>
          <thead>
            <tr>
              <th className="border border-gray-100 bg-gray-50 px-2 py-1 text-left text-[11px] font-semibold text-gray-500">
                &nbsp;
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="border border-gray-100 bg-gray-50 px-2 py-1 text-center text-[11px] font-semibold text-gray-600"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th className="border border-gray-100 bg-gray-50 px-2 py-1 text-center text-[11px] font-semibold text-gray-600">
                  {row}
                </th>
                {columns.map((col) => {
                  const key = getKey(row, col)
                  const value = getCell(row, col)
                  return (
                    <td
                      key={key}
                      className="border border-gray-100 px-1 py-1 align-top"
                    >
                      {renderCell(value, { row, column: col })}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


