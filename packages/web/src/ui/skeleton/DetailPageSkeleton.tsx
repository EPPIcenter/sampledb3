export interface DetailPageSkeletonProps {
  showBreadcrumbs?: boolean
  showActions?: boolean
  sections?: number
}

export function DetailPageSkeleton({
  showBreadcrumbs = true,
  showActions = true,
  sections = 2,
}: DetailPageSkeletonProps) {
  return (
    <div className="container mx-auto px-4 py-8 animate-pulse">
      {showBreadcrumbs && (
        <div className="mb-4">
          <div className="h-4 app-skeleton-bar rounded w-64" />
        </div>
      )}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="h-8 app-skeleton-bar rounded w-1/3 mb-2" />
            <div className="h-4 app-skeleton-bar rounded w-1/4" />
          </div>
          {showActions && (
            <div className="flex gap-3">
              <div className="h-10 app-skeleton-bar rounded w-24" />
              <div className="h-10 app-skeleton-bar rounded w-24" />
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-app-card rounded-lg shadow p-4">
            <div className="h-5 app-skeleton-bar rounded w-24 mb-3" />
            <div className="space-y-2">
              <div className="h-3 app-skeleton-bar rounded w-full" />
              <div className="h-3 app-skeleton-bar rounded w-3/4" />
              <div className="h-3 app-skeleton-bar rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="bg-app-card rounded-lg shadow mb-6">
          <div className="p-4 border-b border-app-border">
            <div className="h-6 app-skeleton-bar rounded w-32" />
          </div>
          <div className="p-4">
            <div className="space-y-3">
              <div className="h-4 app-skeleton-bar rounded w-full" />
              <div className="h-4 app-skeleton-bar rounded w-5/6" />
              <div className="h-4 app-skeleton-bar rounded w-4/6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
