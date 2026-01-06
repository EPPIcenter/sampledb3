import { Link } from 'react-router-dom'
import { Study, StudySummaryBasic } from '../../lib/api'
import SkeletonList from '../SkeletonList'

interface RecentStudiesProps {
  studies: Array<Study & { summary?: StudySummaryBasic | null }>
  loading?: boolean
}

export default function RecentStudies({ studies, loading }: RecentStudiesProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Recent Studies</h2>
        <SkeletonList count={5} itemHeight="h-20" />
      </div>
    )
  }

  if (studies.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Recent Studies</h2>
        <div className="text-center py-8 text-gray-500">No studies found</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Recent Studies</h2>
      <div className="space-y-3">
        {studies.slice(0, 10).map((study) => (
          <Link
            key={study.id}
            to={`/studies/${study.id}`}
            className="block p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label={`View study ${study.title}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-gray-900 truncate">{study.title}</h3>
                  <span className="text-sm text-gray-500 font-mono flex-shrink-0">
                    ({study.shortCode})
                  </span>
                </div>
                {study.summary && (
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <span>
                      <span className="font-medium">{study.summary.totalSubjects}</span> subjects
                    </span>
                    <span>
                      <span className="font-medium">{study.summary.totalSpecimens}</span> specimens
                    </span>
                    <span>
                      <span className="font-medium">{study.summary.totalContainers}</span> containers
                    </span>
                  </div>
                )}
              </div>
              <div className="ml-4 text-right flex-shrink-0">
                <span className="text-xs text-gray-500">
                  {new Date(study.lastUpdated).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <Link
          to="/studies"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          aria-label="View all studies"
        >
          View All Studies →
        </Link>
      </div>
    </div>
  )
}

