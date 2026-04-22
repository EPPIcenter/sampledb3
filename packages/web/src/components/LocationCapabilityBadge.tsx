interface LocationCapabilityBadgeProps {
  canContainCollections: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Visual badge indicating whether a location can contain collections
 */
export default function LocationCapabilityBadge({
  canContainCollections,
  className = '',
  size = 'md',
}: LocationCapabilityBadgeProps) {
  if (!canContainCollections) {
    return null
  }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-2.5 py-1.5 text-sm',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-app-trend-up/10 text-app-trend-up font-medium ${sizeClasses[size]} ${className}`}
      title="This location can contain collections"
    >
      <svg
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
      <span>Collections</span>
    </span>
  )
}

