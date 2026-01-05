import type { SpecimenType } from '../lib/api'
import ContainerTypeToggle from './ContainerTypeToggle'

interface ContainerTypesCellProps {
  item: SpecimenType
  allowedTypes: string[]
  onToggle?: (specimenTypeId: number, containerType: string, isAdding: boolean) => Promise<void>
  usageInfo?: Record<string, boolean>
}

export default function ContainerTypesCell({
  item,
  allowedTypes,
  onToggle,
  usageInfo = {},
}: ContainerTypesCellProps) {
  if (!onToggle) {
    // Fallback display if no toggle handler provided
    return (
      <div className="flex flex-wrap gap-1">
        {allowedTypes.length > 0 ? (
          allowedTypes.map((ct) => (
            <span
              key={ct}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
            >
              {ct}
            </span>
          ))
        ) : (
          <span className="text-sm text-gray-400">None</span>
        )}
      </div>
    )
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ContainerTypeToggle
        specimenTypeId={item.id}
        allowedTypes={allowedTypes}
        onToggle={onToggle}
        usageInfo={usageInfo}
      />
    </div>
  )
}

