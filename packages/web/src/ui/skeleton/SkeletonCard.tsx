export interface SkeletonCardProps {
  className?: string
  height?: string
}

export function SkeletonCard({ className = '', height = 'h-24' }: SkeletonCardProps) {
  return (
    <div
      className={`bg-app-card rounded-lg shadow p-6 border border-app-border animate-pulse ${className}`.trim()}
    >
      <div className="space-y-3">
        <div className="h-4 app-skeleton-bar rounded w-1/3" />
        <div className={`app-skeleton-bar rounded ${height}`} />
      </div>
    </div>
  )
}
