import { Link } from 'react-router-dom'
import { getCollectionTypeIcon, getCollectionTypeName } from '../lib/icons'
import { formatDate, formatDateWithRelativeTime } from '../lib/date-utils'

interface ContentCardProps {
  id: number
  name: string
  barcode?: string | null
  created: string
  lastUpdated: string
  collectionType: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
  detailUrl: string
}

const COLLECTION_TYPE_COLORS: Record<string, string> = {
  micronix_plate: 'bg-blue-50 text-blue-700 border-blue-200',
  cryovial_box: 'bg-purple-50 text-purple-700 border-purple-200',
  box: 'bg-green-50 text-green-700 border-green-200',
  bag: 'bg-orange-50 text-orange-700 border-orange-200',
}

export default function ContentCard({
  id,
  name,
  barcode,
  created,
  lastUpdated,
  collectionType,
  detailUrl,
}: ContentCardProps) {
  const icon = getCollectionTypeIcon(collectionType)
  const typeName = getCollectionTypeName(collectionType)
  const badgeColor = COLLECTION_TYPE_COLORS[collectionType] || 'bg-gray-50 text-gray-700 border-gray-200'

  return (
    <Link
      to={detailUrl}
      className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition-all duration-150"
    >
      {/* Header with icon and type badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-gray-600">{icon}</div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${badgeColor}`}>
            {typeName}
          </span>
        </div>
      </div>

      {/* Name */}
      <h3 className="font-semibold text-gray-900 mb-2 truncate" title={name}>
        {name}
      </h3>

      {/* Metadata */}
      <div className="space-y-1.5 text-xs text-gray-600">
        {barcode && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
            <span className="font-mono text-gray-700">{barcode}</span>
          </div>
        )}
        
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Created: {formatDate(created)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Updated: {formatDateWithRelativeTime(lastUpdated)}</span>
        </div>
      </div>
    </Link>
  )
}

