import type { Tag } from '../../lib/api/reference-data'
import type { SpecimenType, StudySubject } from '../../lib/api/types'
import type { ExportFilters } from '../../lib/api/export'

const CONTAINER_TYPES = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
  { value: 'static_well', label: 'Static Well' },
]

interface ExportModalFiltersPanelProps {
  uploadMode: 'manual' | 'csv'
  filters: ExportFilters
  specimenTypes: SpecimenType[]
  tags: Tag[]
  availableContainerTypes: string[]
  subjects: StudySubject[]
  loadingRefData: boolean
  hasActiveFilters: boolean
  onUpdateFilter: <K extends keyof ExportFilters>(key: K, value: ExportFilters[K]) => void
  onToggleArrayFilter: (key: 'specimen_type_ids' | 'container_types' | 'tag_ids' | 'subject_ids', value: number | string) => void
  onClearFilters: () => void
}

export default function ExportModalFiltersPanel({
  uploadMode,
  filters,
  specimenTypes,
  tags,
  availableContainerTypes,
  subjects,
  loadingRefData,
  hasActiveFilters,
  onUpdateFilter,
  onToggleArrayFilter,
  onClearFilters,
}: ExportModalFiltersPanelProps) {
  return (
    <div className="space-y-4 mb-6">
      <div>
        <label className="block text-sm font-medium text-app-text mb-2">Specimen Types</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto border border-app-border rounded p-2">
          {loadingRefData ? (
            <div className="text-sm text-app-text-muted">Loading...</div>
          ) : (
            specimenTypes.map((type) => (
              <label key={type.id} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.specimen_type_ids?.includes(type.id) || false}
                  onChange={() => onToggleArrayFilter('specimen_type_ids', type.id)}
                  className="rounded border-app-border text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text">{type.name}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-app-text mb-2">Container Types</label>
        {availableContainerTypes.length === 0 ? (
          <div className="text-sm text-app-text-muted italic">No containers found in this study</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {CONTAINER_TYPES.filter((type) => availableContainerTypes.includes(type.value)).map((type) => (
              <label key={type.value} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.container_types?.includes(type.value) || false}
                  onChange={() => onToggleArrayFilter('container_types', type.value)}
                  className="rounded border-app-border text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text">{type.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-app-text mb-2">Collection Date Range</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={filters.date_from || ''}
              onChange={(e) => onUpdateFilter('date_from', e.target.value || undefined)}
              className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
            />
            <input
              type="date"
              value={filters.date_to || ''}
              onChange={(e) => onUpdateFilter('date_to', e.target.value || undefined)}
              className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-app-text mb-2">Created Date Range</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={filters.created_from || ''}
              onChange={(e) => onUpdateFilter('created_from', e.target.value || undefined)}
              className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
            />
            <input
              type="date"
              value={filters.created_to || ''}
              onChange={(e) => onUpdateFilter('created_to', e.target.value || undefined)}
              className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-app-text mb-2">Tags (optional)</label>
          <div className="max-h-32 overflow-y-auto border border-app-border rounded p-2">
            {loadingRefData ? (
              <div className="text-sm text-app-text-muted">Loading...</div>
            ) : (
              tags.map((tag) => (
                <label key={tag.id} className="flex items-center space-x-2 cursor-pointer mb-1">
                  <input
                    type="checkbox"
                    checked={filters.tag_ids?.includes(tag.id) || false}
                    onChange={() => onToggleArrayFilter('tag_ids', tag.id)}
                    className="rounded border-app-border text-app-accent focus:ring-app-accent"
                  />
                  <span className="text-sm text-app-text">{tag.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </div>

      {uploadMode === 'manual' && subjects.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-app-text mb-2">Subjects (optional)</label>
          <div className="max-h-32 overflow-y-auto border border-app-border rounded p-2">
            {subjects.map((subject) => (
              <label key={subject.id} className="flex items-center space-x-2 cursor-pointer mb-1">
                <input
                  type="checkbox"
                  checked={filters.subject_ids?.includes(subject.id) || false}
                  onChange={() => onToggleArrayFilter('subject_ids', subject.id)}
                  className="rounded border-app-border text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text">{subject.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {hasActiveFilters && (
        <div>
          <button onClick={onClearFilters} className="text-sm text-app-accent hover:text-app-accent-hover">
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  )
}
