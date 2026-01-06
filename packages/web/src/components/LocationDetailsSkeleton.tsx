/**
 * Skeleton loader for location details panel
 * Matches the structure of the actual location details to prevent layout shifts
 */
export default function LocationDetailsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Location Preview Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 bg-gray-200 rounded w-40"></div>
              <div className="h-5 bg-gray-200 rounded w-24"></div>
            </div>
            <div className="h-4 bg-gray-200 rounded w-64 mt-2"></div>
            <div className="h-4 bg-gray-200 rounded w-48 mt-2"></div>
            <div className="h-3 bg-gray-200 rounded w-32 mt-2"></div>
            <div className="h-3 bg-gray-200 rounded w-56 mt-2"></div>
          </div>
          <div className="h-9 bg-gray-200 rounded w-32"></div>
        </div>
      </div>

      {/* Hierarchy Statistics Skeleton */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="h-4 bg-gray-200 rounded w-40 mb-3"></div>
        <div className="flex items-center justify-between">
          <div>
            <div className="h-3 bg-gray-200 rounded w-24 mb-1"></div>
            <div className="h-6 bg-gray-200 rounded w-16"></div>
            <div className="h-3 bg-gray-200 rounded w-32 mt-0.5"></div>
          </div>
          <div className="h-6 bg-gray-200 rounded w-24"></div>
        </div>
      </div>

      {/* Container Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="h-3 bg-gray-200 rounded w-24 mb-1"></div>
          <div className="h-8 bg-gray-200 rounded w-16"></div>
          <div className="h-3 bg-gray-200 rounded w-32 mt-1"></div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="h-3 bg-gray-200 rounded w-28 mb-1"></div>
          <div className="space-y-1">
            <div className="h-3 bg-gray-200 rounded w-full"></div>
            <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="h-3 bg-gray-200 rounded w-16 mb-1"></div>
          <div className="h-4 bg-gray-200 rounded w-32"></div>
        </div>
      </div>

      {/* Container Statistics Section */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="h-4 bg-gray-200 rounded w-40 mb-3"></div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 pb-3 border-b border-gray-200">
            <div>
              <div className="h-3 bg-gray-200 rounded w-24 mb-1"></div>
              <div className="h-8 bg-gray-200 rounded w-20"></div>
              <div className="h-3 bg-gray-200 rounded w-32 mt-0.5"></div>
            </div>
            <div>
              <div className="h-3 bg-gray-200 rounded w-28 mb-1"></div>
              <div className="h-8 bg-gray-200 rounded w-20"></div>
              <div className="h-3 bg-gray-200 rounded w-40 mt-0.5"></div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-gray-50 rounded p-2">
              <div className="h-3 bg-gray-200 rounded w-20 mb-1"></div>
              <div className="h-4 bg-gray-200 rounded w-8"></div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="h-3 bg-gray-200 rounded w-24 mb-1"></div>
              <div className="h-4 bg-gray-200 rounded w-8"></div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="h-3 bg-gray-200 rounded w-12 mb-1"></div>
              <div className="h-4 bg-gray-200 rounded w-8"></div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="h-3 bg-gray-200 rounded w-12 mb-1"></div>
              <div className="h-4 bg-gray-200 rounded w-8"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Contents Preview Skeleton */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-gray-200 rounded w-32"></div>
          <div className="h-4 bg-gray-200 rounded w-16"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="h-4 bg-gray-200 rounded w-36 mb-2"></div>
            <div className="space-y-1">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              <div className="h-4 bg-gray-200 rounded w-4/6"></div>
              <div className="h-4 bg-gray-200 rounded w-3/6"></div>
              <div className="h-4 bg-gray-200 rounded w-2/6"></div>
            </div>
          </div>
          <div>
            <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="space-y-1">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

