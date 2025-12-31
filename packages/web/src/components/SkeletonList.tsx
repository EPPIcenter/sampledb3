interface SkeletonListProps {
  count?: number
  itemHeight?: string
  showAvatar?: boolean
}

export default function SkeletonList({ count = 5, itemHeight = 'h-16', showAvatar = false }: SkeletonListProps) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`bg-white rounded-lg border border-gray-100 p-4 ${itemHeight}`}>
          <div className="flex items-center gap-3">
            {showAvatar && (
              <div className="h-10 w-10 bg-gray-200 rounded-full flex-shrink-0"></div>
            )}
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

