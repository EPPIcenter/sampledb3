import { StudyCardSkeleton } from './StudyCardSkeleton'

export interface StudyListSkeletonProps {
  count?: number
  viewMode?: 'grid' | 'list'
}

export function StudyListSkeleton({ count = 8, viewMode = 'grid' }: StudyListSkeletonProps) {
  const gridClass =
    viewMode === 'list'
      ? 'grid-cols-1'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {Array.from({ length: count }).map((_, i) => (
        <StudyCardSkeleton key={i} />
      ))}
    </div>
  )
}
