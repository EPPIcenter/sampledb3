import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { CollectionEntryContainer } from '../lib/collection-table-columns'

export interface UnplacedContainerEntry {
  id: number
  barcode?: string | null
  /** The stored position as recorded, missing when none is recorded. */
  position?: string | null
  container?: unknown
}

export interface UnplacedContainersSectionProps {
  entries: UnplacedContainerEntry[]
  /** Collection kind for the explanatory text, e.g. "plate" or "box". */
  collectionLabel: string
}

/**
 * Containers that belong to a plate or box but occupy no grid cell: their grid
 * position is missing, or the stored value is not a cell of the grid.
 */
export default function UnplacedContainersSection({ entries, collectionLabel }: UnplacedContainersSectionProps) {
  const headingId = useId()
  if (entries.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h3 id={headingId} className="text-base font-semibold storage-section-title">
        Unplaced ({entries.length})
      </h3>
      <p className="mt-1 mb-3 text-xs text-app-text-muted">
        These Containers belong to this {collectionLabel} but have no grid position, or a stored position that is not
        on the {collectionLabel} grid.
      </p>
      <div className="overflow-x-auto">
        <table className="storage-grid-table min-w-full border-collapse text-xs md:text-sm">
          <thead>
            <tr>
              {['Stored position', 'Barcode', 'Subject or control', 'Specimen type', 'Status'].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="border border-app-border bg-app-surface px-2 py-1 text-left text-[11px] font-semibold text-app-text-muted"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const container = entry.container as CollectionEntryContainer | null | undefined
              const source = container?.source
              const sourceName = source?.type === 'subject' || source?.type === 'control' ? (source.name ?? '') : ''
              const status =
                container == null
                  ? ''
                  : container.remainingQuantity != null && container.remainingQuantity > 0
                    ? 'In Use'
                    : 'Exhausted'
              return (
                <tr key={entry.id}>
                  <td className="border border-app-border px-2 py-1 font-mono">
                    {entry.position ? entry.position : <span className="text-app-text-muted">None</span>}
                  </td>
                  <td className="border border-app-border px-2 py-1 font-mono">
                    <Link to={`/containers/${entry.id}`} className="text-app-accent underline">
                      {entry.barcode || `Container ${entry.id}`}
                    </Link>
                  </td>
                  <td className="border border-app-border px-2 py-1">{sourceName}</td>
                  <td className="border border-app-border px-2 py-1">{container?.specimenTypeName ?? ''}</td>
                  <td className="border border-app-border px-2 py-1">{status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
