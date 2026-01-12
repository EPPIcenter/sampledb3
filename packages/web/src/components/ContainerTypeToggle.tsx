import { useState } from 'react'
import { CONTAINER_TYPES } from '../lib/container-types'

interface ContainerTypeToggleProps {
  specimenTypeId: number
  allowedTypes: string[]
  onToggle: (specimenTypeId: number, containerType: string, isAdding: boolean) => Promise<void>
  disabled?: boolean
  usageInfo?: Record<string, boolean> // Maps containerType to whether it's in use
}

export default function ContainerTypeToggle({
  specimenTypeId,
  allowedTypes,
  onToggle,
  disabled = false,
  usageInfo = {},
}: ContainerTypeToggleProps) {
  const [loadingTypes, setLoadingTypes] = useState<Set<string>>(new Set())

  const handleToggle = async (containerType: string) => {
    if (disabled || loadingTypes.has(containerType)) return

    const isSelected = allowedTypes.includes(containerType)
    // Prevent removal if container type is in use
    if (isSelected && usageInfo[containerType]) {
      return
    }

    setLoadingTypes((prev) => new Set(prev).add(containerType))

    try {
      await onToggle(specimenTypeId, containerType, !isSelected)
    } catch (error) {
      console.error('Failed to toggle container type:', error)
      // Error handling is done by parent component
    } finally {
      setLoadingTypes((prev) => {
        const next = new Set(prev)
        next.delete(containerType)
        return next
      })
    }
  }

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {CONTAINER_TYPES.map((ct) => {
        const isSelected = allowedTypes.includes(ct.value)
        const isLoading = loadingTypes.has(ct.value)
        const isInUse = usageInfo[ct.value] || false
        // Disable if: general disabled, loading, or trying to remove an in-use container type
        const isDisabled = disabled || isLoading || (isSelected && isInUse)

        // Build tooltip text
        let tooltip = isSelected ? 'Click to remove' : 'Click to add'
        if (isSelected && isInUse) {
          tooltip = 'Cannot remove: container type is in use by existing containers. Please remove or reassign those containers first.'
        }

        return (
          <button
            key={ct.value}
            type="button"
            onClick={() => handleToggle(ct.value)}
            disabled={isDisabled}
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              isSelected
                ? isInUse
                  ? 'bg-blue-600 text-white hover:bg-blue-600 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={tooltip}
          >
            {isLoading ? (
              <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
            ) : null}
            {ct.label}
            {isSelected && isInUse && (
              <svg 
                className="ml-1 w-3 h-3" 
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
                <title>In use - cannot be removed</title>
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

