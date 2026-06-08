import { useState } from 'react'
import type { ContainerConfig } from '../../pages/ControlBatchWizard'

export interface UnitOption {
  id: number
  symbol: string
  name?: string
}

interface PapersSectionProps {
  containers: ContainerConfig[]
  specimenTypeId: string
  onUpdate: (specimenTypeId: string, containerId: string, updates: Partial<ContainerConfig>) => void
  onAdd: () => void
  onRemove: (specimenTypeId: string, containerId: string) => void
  /** When provided, unit is rendered as a dropdown of allowed units instead of free text. */
  allowedUnits?: UnitOption[]
}

export default function PapersSection({
  containers,
  specimenTypeId,
  onUpdate,
  onAdd,
  onRemove,
  allowedUnits,
}: PapersSectionProps) {
  const [expanded, setExpanded] = useState(containers.length <= 3)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-sm font-medium flex items-center gap-1 hover:text-app-text"
          aria-expanded={expanded}
          aria-controls="papers-list"
        >
          <span className="text-app-text-muted">
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
              className="grid grid-cols-4 gap-2 items-center bg-app-card p-2 rounded border border-app-border"
            >
              <input
                type="text"
                placeholder="Sublabel"
                value={container.sublabel || ''}
                onChange={(e) =>
                  onUpdate(specimenTypeId, container.id, { sublabel: e.target.value })
                }
                className="px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
              />
              <input
                type="text"
                placeholder="Position"
                value={container.position || ''}
                onChange={(e) =>
                  onUpdate(specimenTypeId, container.id, { position: e.target.value })
                }
                className="px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
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
                className="px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
              />
              <div className="flex gap-2">
                {allowedUnits && allowedUnits.length > 0 ? (
                  <select
                    aria-label="Unit"
                    value={container.unitSymbol && allowedUnits.some((u) => u.symbol === container.unitSymbol) ? container.unitSymbol : allowedUnits[0]!.symbol}
                    onChange={(e) =>
                      onUpdate(specimenTypeId, container.id, { unitSymbol: e.target.value })
                    }
                    className="flex-1 px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
                  >
                    {allowedUnits.map((u) => (
                      <option key={u.id} value={u.symbol}>
                        {u.symbol}{u.name ? ` (${u.name})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Unit"
                    value={container.unitSymbol || ''}
                    onChange={(e) =>
                      onUpdate(specimenTypeId, container.id, { unitSymbol: e.target.value })
                    }
                    className="flex-1 px-2 py-1 border border-app-border rounded text-sm bg-app-card text-app-text"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onRemove(specimenTypeId, container.id)}
                  className="px-2 py-1 text-xs font-medium text-app-trend-down bg-app-trend-down/10 border border-app-trend-down rounded hover:bg-app-trend-down/20 transition-colors"
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
