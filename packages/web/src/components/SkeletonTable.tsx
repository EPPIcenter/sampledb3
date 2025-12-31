interface SkeletonTableProps {
  rows?: number
  columns?: number
  density?: 'normal' | 'compact'
}

export default function SkeletonTable({ rows = 5, columns = 4, density = 'normal' }: SkeletonTableProps) {
  const paddingClass = density === 'compact' ? 'px-3 py-2' : 'px-6 py-3'
  const textSizeClass = density === 'compact' ? 'text-xs' : 'text-sm'

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden animate-pulse">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className={`${paddingClass} text-left`}>
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex} className={`${paddingClass} ${textSizeClass}`}>
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
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

