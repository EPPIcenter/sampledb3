export default function StudyCardSkeleton() {
  return (
    <div
      className="studies-card rounded-xl p-6 animate-pulse border-l-4"
      style={{ borderLeftColor: 'rgb(var(--dashboard-accent) / 0.3)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="h-6 rounded w-3/4 mb-2" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
          <div className="h-4 rounded w-1/2" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
        </div>
        <div className="h-6 w-16 rounded" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
      </div>

      {/* Badges */}
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-20 rounded" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
        <div className="h-5 w-24 rounded" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="space-y-2">
          <div className="h-3 rounded w-16" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
          <div className="h-5 rounded w-12" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
        </div>
        <div className="space-y-2">
          <div className="h-3 rounded w-16" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
          <div className="h-5 rounded w-12" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
        </div>
        <div className="space-y-2">
          <div className="h-3 rounded w-16" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
          <div className="h-5 rounded w-12" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
        </div>
        <div className="space-y-2">
          <div className="h-3 rounded w-16" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
          <div className="h-5 rounded w-12" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-2 pt-4 border-t" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
        <div className="h-3 rounded w-full" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
        <div className="h-3 rounded w-2/3" style={{ backgroundColor: 'rgb(var(--dashboard-border))' }}></div>
      </div>
    </div>
  )
}

