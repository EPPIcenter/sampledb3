interface SkeletonListProps {
  count?: number
  itemHeight?: string
  showAvatar?: boolean
}

export default function SkeletonList({ count = 5, itemHeight = 'h-16', showAvatar = false }: SkeletonListProps) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`bg-app-card rounded-lg border border-app-border p-4 ${itemHeight}`}>
          <div className="flex items-center gap-3">
            {showAvatar && (
              <div className="h-10 w-10 bg-app-surface rounded-full flex-shrink-0"></div>
            )}
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-app-surface rounded w-3/4"></div>
              <div className="h-3 bg-app-surface rounded w-1/2"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

