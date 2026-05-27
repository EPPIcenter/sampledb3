export interface LocationDetailsSkeletonProps {
  className?: string
}

/**
 * Skeleton loader for location details panel.
 * Pass className="storage-skeleton" when used inside .storage-page for token-based pulse color.
 */
export function LocationDetailsSkeleton({ className = '' }: LocationDetailsSkeletonProps) {
  return (
    <div className={`space-y-4 animate-pulse ${className}`.trim()}>
      <div className="bg-app-card rounded-lg shadow p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 app-skeleton-bar rounded w-40" />
              <div className="h-5 app-skeleton-bar rounded w-24" />
            </div>
            <div className="h-4 app-skeleton-bar rounded w-64 mt-2" />
            <div className="h-4 app-skeleton-bar rounded w-48 mt-2" />
            <div className="h-3 app-skeleton-bar rounded w-32 mt-2" />
            <div className="h-3 app-skeleton-bar rounded w-56 mt-2" />
          </div>
          <div className="h-9 app-skeleton-bar rounded w-32" />
        </div>
      </div>

      <div className="bg-app-card rounded-lg shadow p-4">
        <div className="h-4 app-skeleton-bar rounded w-40 mb-3" />
        <div className="flex items-center justify-between">
          <div>
            <div className="h-3 app-skeleton-bar rounded w-24 mb-1" />
            <div className="h-6 app-skeleton-bar rounded w-16" />
            <div className="h-3 app-skeleton-bar rounded w-32 mt-0.5" />
          </div>
          <div className="h-6 app-skeleton-bar rounded w-24" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-app-card rounded-lg shadow p-4">
          <div className="h-3 app-skeleton-bar rounded w-24 mb-1" />
          <div className="h-8 app-skeleton-bar rounded w-16" />
          <div className="h-3 app-skeleton-bar rounded w-32 mt-1" />
        </div>
        <div className="bg-app-card rounded-lg shadow p-4">
          <div className="h-3 app-skeleton-bar rounded w-28 mb-1" />
          <div className="space-y-1">
            <div className="h-3 app-skeleton-bar rounded w-full" />
            <div className="h-3 app-skeleton-bar rounded w-3/4" />
            <div className="h-3 app-skeleton-bar rounded w-2/3" />
            <div className="h-3 app-skeleton-bar rounded w-1/2" />
          </div>
        </div>
        <div className="bg-app-card rounded-lg shadow p-4">
          <div className="h-3 app-skeleton-bar rounded w-16 mb-1" />
          <div className="h-4 app-skeleton-bar rounded w-32" />
        </div>
      </div>

      <div className="bg-app-card rounded-lg shadow p-4">
        <div className="h-4 app-skeleton-bar rounded w-40 mb-3" />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 pb-3 border-b border-app-border">
            <div>
              <div className="h-3 app-skeleton-bar rounded w-24 mb-1" />
              <div className="h-8 app-skeleton-bar rounded w-20" />
              <div className="h-3 app-skeleton-bar rounded w-32 mt-0.5" />
            </div>
            <div>
              <div className="h-3 app-skeleton-bar rounded w-28 mb-1" />
              <div className="h-8 app-skeleton-bar rounded w-20" />
              <div className="h-3 app-skeleton-bar rounded w-40 mt-0.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-app-surface rounded p-2">
                <div className="h-3 app-skeleton-bar rounded w-20 mb-1" />
                <div className="h-4 app-skeleton-bar rounded w-8" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-app-card rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 app-skeleton-bar rounded w-32" />
          <div className="h-4 app-skeleton-bar rounded w-16" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="h-4 app-skeleton-bar rounded w-36 mb-2" />
            <div className="space-y-1">
              <div className="h-4 app-skeleton-bar rounded w-full" />
              <div className="h-4 app-skeleton-bar rounded w-5/6" />
              <div className="h-4 app-skeleton-bar rounded w-4/6" />
              <div className="h-4 app-skeleton-bar rounded w-3/6" />
              <div className="h-4 app-skeleton-bar rounded w-2/6" />
            </div>
          </div>
          <div>
            <div className="h-4 app-skeleton-bar rounded w-32 mb-2" />
            <div className="space-y-1">
              <div className="h-4 app-skeleton-bar rounded w-full" />
              <div className="h-4 app-skeleton-bar rounded w-5/6" />
              <div className="h-4 app-skeleton-bar rounded w-4/6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
