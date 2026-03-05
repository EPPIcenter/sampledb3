import { useState } from 'react'
import type { ContainerConfig } from '../../pages/ControlBatchWizard'

interface PapersSectionProps {
  containers: ContainerConfig[]
  specimenTypeId: string
  onUpdate: (specimenTypeId: string, containerId: string, updates: Partial<ContainerConfig>) => void
  onAdd: () => void
  onRemove: (specimenTypeId: string, containerId: string) => void
}

export default function PapersSection({
  containers,
  specimenTypeId,
  onUpdate,
  onAdd,
  onRemove,
}: PapersSectionProps) {
  const [expanded, setExpanded] = useState(containers.length <= 3)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-sm font-medium flex items-center gap-1 hover:text-gray-700"
          aria-expanded={expanded}
          aria-controls="papers-list"
        >
          <span className="text-gray-600">
            Papers in this sheet ({containers.length})
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="px-2 py-1 text-xs blood-controls-btn-primary"
        >
          + Add Paper
        </button>
      </div>

      {expanded && (
        <div id="papers-list" className="space-y-2" role="region" aria-label="Papers list">
          {containers.map((container) => (
            <div
              key={container.id}
              className="grid grid-cols-4 gap-2 items-center bg-white p-2 rounded border border-gray-200"
            >
              <input
                type="text"
                placeholder="Barcode"
                value={container.barcode || ''}
                onChange={(e) =>
                  onUpdate(specimenTypeId, container.id, { barcode: e.target.value })
                }
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              />
              <input
                type="text"
                placeholder="Position"
                value={container.position || ''}
                onChange={(e) =>
                  onUpdate(specimenTypeId, container.id, { position: e.target.value })
                }
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              />
              <input
                type="number"
                placeholder="Quantity"
                value={container.quantity ?? ''} // eslint-disable-line @typescript-eslint/no-unnecessary-condition
                onChange={(e) =>
                  onUpdate(specimenTypeId, container.id, {
                    quantity: parseFloat(e.target.value) || 0,
                  })
                }
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Unit"
                  value={container.unitSymbol || ''}
                  onChange={(e) =>
                    onUpdate(specimenTypeId, container.id, { unitSymbol: e.target.value })
                  }
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <button
                  type="button"
                  onClick={() => onRemove(specimenTypeId, container.id)}
                  className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 hover:border-red-300 transition-colors"
                  title="Remove this paper"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
