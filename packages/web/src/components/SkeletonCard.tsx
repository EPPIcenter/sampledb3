interface SkeletonCardProps {
  className?: string
  height?: string
}

export default function SkeletonCard({ className = '', height = 'h-24' }: SkeletonCardProps) {
  return (
    <div className={`bg-white rounded-lg shadow p-6 border border-gray-100 animate-pulse ${className}`}>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        <div className={`bg-gray-200 rounded ${height}`}></div>
      </div>
    </div>
  )
}

