import React from 'react'
import type { QpcrExperimentWell } from '../../lib/api'

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COLS = 12

function wellPositionToKey(row: string, col: number): string {
  return `${row}${col.toString().padStart(2, '0')}`
}

function getWellLabel(well: QpcrExperimentWell | undefined): string {
  if (!well) return ''
  if (well.source?.type === 'subject') return well.source.name
  if (well.source?.type === 'control') {
    const density = well.standardDensity != null ? ` (${well.standardDensity})` : ''
    return `${well.source.name}${density}`
  }
  return well.barcode ?? ''
}

function getWellContentType(well: QpcrExperimentWell | undefined): 'standard' | 'unknown' | 'negative' | 'empty' {
  if (!well || !well.barcode) return 'empty'
  switch (well.contentType) {
    case 'standard':
      return 'standard'
    case 'negative':
      return 'negative'
    case 'unknown':
      return 'unknown'
    default:
      return 'unknown'
  }
}

const WELL_STYLES: Record<'standard' | 'unknown' | 'negative' | 'empty', string> = {
  standard: 'bg-amber-50 border-amber-300/80 text-amber-900',
  unknown: 'bg-teal-50/90 border-teal-300/70 text-teal-900',
  negative: 'bg-slate-100/90 border-slate-300/70 text-slate-600',
  empty: 'bg-slate-50/80 border-slate-200 text-slate-400',
}

export interface QpcrWellPlateProps {
  wells: QpcrExperimentWell[]
  /** Currently selected well position (e.g. "A01"). When set, that well shows selected state. */
  selectedWellPosition?: string | null
  /** Called when user clicks a well. Second arg is the well data, or undefined for empty positions. */
  onWellSelect?: (position: string, well: QpcrExperimentWell | undefined) => void
}

export default function QpcrWellPlate({ wells, selectedWellPosition = null, onWellSelect }: QpcrWellPlateProps) {
  const wellMap = new Map<string, QpcrExperimentWell>()
  wells.forEach((w) => wellMap.set(w.wellPosition, w))
  const isSelectable = typeof onWellSelect === 'function'

  return (
    <div className="qpcr-well-plate">
      <div className="inline-block overflow-x-auto rounded-2xl border-2 border-slate-200 bg-slate-50/50 p-4 shadow-md">
        <div
          className="grid gap-px"
          style={{ gridTemplateColumns: `auto repeat(${COLS}, minmax(2.25rem, 2.25rem))` }}
        >
          <div className="min-h-[1.75rem] w-6" />
          {Array.from({ length: COLS }, (_, i) => (
            <div
              key={i}
              className="flex min-h-[2.25rem] min-w-[2.25rem] items-center justify-center text-[10px] font-medium text-slate-500"
            >
              {(i + 1).toString().padStart(2, '0')}
            </div>
          ))}
          {ROWS.map((row) => (
            <React.Fragment key={row}>
              <div className="flex min-h-[2.25rem] w-6 items-center justify-center pr-1 text-[10px] font-medium text-slate-500">
                {row}
              </div>
              {Array.from({ length: COLS }, (_, colIdx) => {
                const pos = wellPositionToKey(row, colIdx + 1)
                const well = wellMap.get(pos)
                const contentType = getWellContentType(well)
                const label = getWellLabel(well)
                const isSelected = selectedWellPosition === pos
                const baseClasses = `flex min-h-[2.25rem] min-w-[2.25rem] items-center justify-center rounded border text-[10px] font-medium truncate px-0.5 transition-[transform,border-color] duration-150 hover:scale-105 hover:border-slate-400 ${WELL_STYLES[contentType]}`
                const selectedClass = isSelected ? ' qpcr-well--selected' : ''
                const focusClass = isSelectable ? ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1' : ''

                if (isSelectable) {
                  return (
                    <button
                      key={pos}
                      type="button"
                      className={baseClasses + selectedClass + focusClass}
                      title={well ? `${pos}: ${label || well.barcode || 'empty'}` : pos}
                      aria-pressed={isSelected}
                      aria-label={`Well ${pos}${well ? `, ${label || well.barcode || 'empty'}` : ', empty'}`}
                      onClick={() => onWellSelect(pos, well)}
                    >
                      {label ? (label.length > 4 ? `${label.slice(0, 3)}…` : label) : well?.barcode ? '…' : ''}
                    </button>
                  )
                }
                return (
                  <div
                    key={pos}
                    className={baseClasses}
                    title={well ? `${pos}: ${label || well.barcode || 'empty'}` : pos}
                  >
                    {label ? (label.length > 4 ? `${label.slice(0, 3)}…` : label) : well?.barcode ? '…' : ''}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-6 text-xs text-slate-600">
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-amber-300/80 bg-amber-50" /> Standard
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-teal-300/70 bg-teal-50" /> Unknown (study sample)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-slate-300/70 bg-slate-100" /> Negative
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-slate-200 bg-slate-50" /> Empty
        </span>
      </div>
    </div>
  )
}
