import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { exportApi } from '../lib/api/export'
import { tagsApi } from '../lib/api/reference-data'
import type { Tag } from '../lib/api/reference-data'
import type { SpecimenType, StudySubject } from '../lib/api/types'
import { useExportConfigurations } from '../hooks/useExportConfigurations'
import { useSingleStudyExportWorkflow } from '../hooks/useSingleStudyExportWorkflow'
import {
  formatExportConfigId,
  getExportColumnsForConfigId,
} from '../lib/export-config-selection'
import { useModifierHotkey } from '../hooks/useHotkey'
import { Modal } from '../ui'
import ExportModalResultSummary from './ExportModalResultSummary'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  studyCode: string
  studyId: number
  subjects?: StudySubject[]
}

const CONTAINER_TYPES = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
  { value: 'static_well', label: 'Static Well' },
]

export default function ExportModal({
  isOpen,
  onClose,
  studyCode,
  studyId,
  subjects = [],
}: ExportModalProps) {
  const workflow = useSingleStudyExportWorkflow({ studyCode, isOpen })
  const {
    filters,
    count,
    loadingCount,
    exporting,
    exportFormat,
    setExportFormat,
    error: workflowError,
    csvDelimiter,
    setCsvDelimiter,
    csvBOM,
    setCsvBOM,
    csvLineEnding,
    setCsvLineEnding,
    uploadMode,
    switchUploadMode,
    csvData,
    csvError,
    dateTolerance,
    updateDateTolerance,
    exportSummary,
    summaryExpanded,
    setSummaryExpanded,
    handleCSVUpload,
    updateFilter,
    toggleArrayFilter,
    clearFilters,
    hasActiveFilters,
    submitExport,
  } = workflow

  const [refDataError, setRefDataError] = useState<string | null>(null)
  const error = refDataError || workflowError

  // Load reference data
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [availableContainerTypes, setAvailableContainerTypes] = useState<string[]>([])
  const [loadingRefData, setLoadingRefData] = useState(true)
  const [focusedConfigIndex, setFocusedConfigIndex] = useState<number | null>(null)
  const {
    configurations: exportConfigurations,
    selectedConfigId,
    setSelectedConfigId,
    loading: loadingConfigs,
    loadConfigurations: loadExportConfigurations,
  } = useExportConfigurations()

  const loadReferenceData = useCallback(async () => {
    try {
      setLoadingRefData(true)
      setRefDataError(null)
      const [availableTypesRes, tagsRes] = await Promise.all([
        exportApi.availableTypes(studyCode),
        tagsApi.list(),
      ])

      setSpecimenTypes(
        availableTypesRes.specimen_types.map((st) => ({
          id: st.id,
          name: st.name,
          created: '',
          lastUpdated: '',
        }))
      )
      setTags(tagsRes.data)
      setAvailableContainerTypes(availableTypesRes.container_types)
    } catch (err: unknown) {
      console.error('Failed to load reference data:', err)
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : err instanceof Error
            ? err.message
            : 'Failed to load export options'
      setRefDataError(message || 'Failed to load export options')
      setSpecimenTypes([])
      setTags([])
      setAvailableContainerTypes([])
    } finally {
      setLoadingRefData(false)
    }
  }, [studyCode])

  useEffect(() => {
    if (!isOpen) return
    setRefDataError(null)
    loadReferenceData()
    loadExportConfigurations()
  }, [isOpen, studyCode])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  const handleExport = async () => {
    const result = await submitExport({
      columns: getExportColumnsForConfigId(exportConfigurations, selectedConfigId) ?? [],
    })
    if (result === 'close') {
      setTimeout(() => {
        onClose()
      }, 1000)
    }
  }

  useModifierHotkey('enter', (e) => {
    if (isOpen && !exporting && count !== 0 && !loadingCount) {
      e.preventDefault()
      void handleExport()
    }
  }, { enabled: isOpen, preventDefault: true })

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      size="lg"
      panelClassName="border border-app-border"
      contentClassName="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4"
    >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-app-text">Export Study Data</h3>
              <button
                type="button"
                onClick={onClose}
                className="text-app-text-muted hover:text-app-text"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
                {error}
              </div>
            )}

            {/* Tab Selection */}
            <div className="mb-6 border-b border-app-border">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => switchUploadMode('manual')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    uploadMode === 'manual'
                      ? 'border-app-accent text-app-accent'
                      : 'border-transparent text-app-text-muted hover:text-app-text hover:border-app-border'
                  }`}
                >
                  Manual Selection
                </button>
                <button
                  onClick={() => switchUploadMode('csv')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    uploadMode === 'csv'
                      ? 'border-app-accent text-app-accent'
                      : 'border-transparent text-app-text-muted hover:text-app-text hover:border-app-border'
                  }`}
                >
                  CSV Upload
                </button>
              </nav>
            </div>

            {/* CSV Upload Section */}
            {uploadMode === 'csv' && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Upload CSV File
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        handleCSVUpload(file)
                      }
                    }}
                    className="file-input-accent"
                  />
                  <p className="mt-1 text-xs text-app-text-muted">
                    CSV should contain: subject_name (required), collection_date (optional), date_from (optional), date_to (optional)
                  </p>
                  {csvError && (
                    <div className="mt-2 p-2 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
                      {csvError}
                    </div>
                  )}
                  {csvData.length > 0 && (
                    <div className="mt-2 p-2 bg-app-trend-up/10 border border-app-trend-up rounded text-app-trend-up text-sm">
                      Successfully parsed {csvData.length} subject{csvData.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Date Tolerance (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={dateTolerance}
                    onChange={(e) => updateDateTolerance(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                    placeholder="0 (exact match)"
                  />
                  <p className="mt-1 text-xs text-app-text-muted">
                    Applies to all subjects with collection_date. Default: 0 (exact match). Example: 2 means ±2 days.
                  </p>
                </div>
              </div>
            )}

            {/* Filters Section */}
            <div className="space-y-4 mb-6">
              {/* Specimen Types */}
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  Specimen Types
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto border border-app-border rounded p-2">
                  {loadingRefData ? (
                    <div className="text-sm text-app-text-muted">Loading...</div>
                  ) : (
                    specimenTypes.map(type => (
                      <label key={type.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.specimen_type_ids?.includes(type.id) || false}
                          onChange={() => toggleArrayFilter('specimen_type_ids', type.id)}
                          className="rounded border-app-border text-app-accent focus:ring-app-accent"
                        />
                        <span className="text-sm text-app-text">{type.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Container Types */}
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  Container Types
                </label>
                {availableContainerTypes.length === 0 ? (
                  <div className="text-sm text-app-text-muted italic">
                    No containers found in this study
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {CONTAINER_TYPES.filter(type => availableContainerTypes.includes(type.value)).map(type => (
                      <label key={type.value} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.container_types?.includes(type.value) || false}
                          onChange={() => toggleArrayFilter('container_types', type.value)}
                          className="rounded border-app-border text-app-accent focus:ring-app-accent"
                        />
                        <span className="text-sm text-app-text">{type.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Date Ranges */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Collection Date Range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={filters.date_from || ''}
                      onChange={(e) => updateFilter('date_from', e.target.value || undefined)}
                      className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                    />
                    <input
                      type="date"
                      value={filters.date_to || ''}
                      onChange={(e) => updateFilter('date_to', e.target.value || undefined)}
                      className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Created Date Range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={filters.created_from || ''}
                      onChange={(e) => updateFilter('created_from', e.target.value || undefined)}
                      className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                    />
                    <input
                      type="date"
                      value={filters.created_to || ''}
                      onChange={(e) => updateFilter('created_to', e.target.value || undefined)}
                      className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                    />
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Tags (optional)
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-app-border rounded p-2">
                    {loadingRefData ? (
                      <div className="text-sm text-app-text-muted">Loading...</div>
                    ) : (
                      tags.map(tag => (
                        <label key={tag.id} className="flex items-center space-x-2 cursor-pointer mb-1">
                          <input
                            type="checkbox"
                            checked={filters.tag_ids?.includes(tag.id) || false}
                            onChange={() => toggleArrayFilter('tag_ids', tag.id)}
                            className="rounded border-app-border text-app-accent focus:ring-app-accent"
                          />
                          <span className="text-sm text-app-text">{tag.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Subjects - Only show in manual mode */}
              {uploadMode === 'manual' && subjects.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Subjects (optional)
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-app-border rounded p-2">
                    {subjects.map(subject => (
                      <label key={subject.id} className="flex items-center space-x-2 cursor-pointer mb-1">
                        <input
                          type="checkbox"
                          checked={filters.subject_ids?.includes(subject.id) || false}
                          onChange={() => toggleArrayFilter('subject_ids', subject.id)}
                          className="rounded border-app-border text-app-accent focus:ring-app-accent"
                        />
                        <span className="text-sm text-app-text">{subject.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Clear Filters Button */}
              {hasActiveFilters() && (
                <div>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-app-accent hover:text-app-accent-hover"
                  >
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>

            {/* Preview Count */}
            <div className="mb-6 p-4 bg-app-surface rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-app-text">Matching Containers:</span>
                {loadingCount ? (
                  <span className="text-sm text-app-text-muted">Calculating...</span>
                ) : (
                  <span className="text-lg font-bold text-app-accent">
                    {count !== null ? count.toLocaleString() : '—'}
                  </span>
                )}
              </div>
            </div>

            {/* Export Configuration Selector */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-app-text">
                  Export Configuration
                </label>
                <Link
                to="/settings?category=data-management&section=export-configurations"
                className="text-xs text-app-accent hover:text-app-accent-hover hover:underline flex items-center gap-1"
              >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage in Settings
                </Link>
              </div>
              {loadingConfigs ? (
                <div className="space-y-1.5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-full h-10 app-skeleton-bar rounded border border-app-border animate-pulse" />
                  ))}
                </div>
              ) : exportConfigurations.length === 0 ? (
                <div className="text-sm p-3 bg-app-surface rounded border border-app-border">
                  <p className="text-app-text mb-2">No export configurations available.</p>
                  <Link
                    to="/settings?category=data-management&section=export-configurations"
                    className="text-app-accent hover:text-app-accent-hover hover:underline font-medium inline-flex items-center gap-1"
                  >
                    Create one in Settings
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              ) : (
                <div 
                  className="space-y-1.5"
                  role="radiogroup"
                  aria-label="Export configuration"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      const currentIndex = focusedConfigIndex ?? exportConfigurations.findIndex(c => formatExportConfigId(c.source!, c.name) === selectedConfigId)
                      let newIndex: number
                    if (e.key === 'ArrowDown') {
                      newIndex = currentIndex < exportConfigurations.length - 1 ? currentIndex + 1 : 0
                    } else {
                      newIndex = currentIndex > 0 ? currentIndex - 1 : exportConfigurations.length - 1
                    }
                    setFocusedConfigIndex(newIndex)
                    const newConfig = exportConfigurations[newIndex]
                    setSelectedConfigId(formatExportConfigId(newConfig.source!, newConfig.name))
                    const button = e.currentTarget.children[newIndex] as HTMLElement
                    button.focus()
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (focusedConfigIndex !== null) {
                      const focusedConfig = exportConfigurations[focusedConfigIndex]
                      setSelectedConfigId(formatExportConfigId(focusedConfig.source!, focusedConfig.name))
                    }
                  }
                  }}
                >
                  {exportConfigurations.map((config, index) => {
                    const configId = formatExportConfigId(config.source!, config.name)
                    const isSelected = configId === selectedConfigId
                    const isFocused = focusedConfigIndex === index
                    return (
                      <button
                        key={configId} // Use unique ID to prevent duplicate keys (fixes Bug 2)
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={`${config.name}, ${config.source === 'personal' ? 'Personal' : 'Shared'} configuration, ${config.columns.length} columns${config.isDefault ? ', Default' : ''}`}
                        onClick={() => {
                          setSelectedConfigId(configId)
                          setFocusedConfigIndex(index)
                        }}
                        onFocus={() => setFocusedConfigIndex(index)}
                        onBlur={() => {
                          // Only clear focus if not selected (selected items should keep focus styling)
                          if (configId !== selectedConfigId) {
                            setFocusedConfigIndex(null)
                          }
                        }}
                        onMouseEnter={() => setFocusedConfigIndex(index)}
                        onMouseLeave={() => {
                          // Only clear focus if not selected (selected items should keep focus styling)
                          if (configId !== selectedConfigId) {
                            setFocusedConfigIndex(null)
                          }
                        }}
                        className={`w-full text-left px-3 py-2 border rounded transition-all focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-1 ${
                          isSelected
                            ? 'border-app-accent bg-app-accent-muted shadow-sm'
                            : isFocused
                            ? 'border-app-accent/50 bg-app-accent-muted/70'
                            : 'border-app-border hover:border-app-accent/50 hover:bg-app-accent-muted/50'
                        }`}
                        title={config.columns.length > 0 ? `Columns: ${config.columns.slice(0, 5).join(', ')}${config.columns.length > 5 ? `, +${config.columns.length - 5} more` : ''}` : 'No columns'}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className={`font-medium text-sm truncate ${isSelected ? 'text-app-accent-hover' : 'text-app-text'}`}>
                              {config.name}
                            </span>
                            {config.isDefault && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-app-accent-muted text-app-accent-hover rounded flex-shrink-0" aria-label="Default configuration">
                                Default
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0 ${
                              config.source === 'personal'
                                ? 'bg-app-accent-muted text-app-accent-hover'
                                : 'bg-app-surface text-app-text-muted'
                            }`} aria-label={config.source === 'personal' ? 'Personal configuration' : 'Shared configuration'}>
                              {config.source === 'personal' ? 'Personal' : 'Shared'}
                            </span>
                            <span className="text-xs text-app-text-muted flex-shrink-0" aria-label={`${config.columns.length} columns`}>
                              {config.columns.length} cols
                            </span>
                          </div>
                          {isSelected && (
                            <svg className="w-4 h-4 text-app-accent-hover flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-app-text-muted">
                Select which columns to include in the export. Configure options in Settings.
              </p>
            </div>

            {/* Export Format Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-app-text mb-2">
                Export Format
              </label>
              <div className="flex gap-4">
                {(['csv', 'xlsx', 'json'] as const).map(format => (
                  <label key={format} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="exportFormat"
                      value={format}
                      checked={exportFormat === format}
                      onChange={() => setExportFormat(format)}
                      className="text-app-accent focus:ring-app-accent"
                    />
                    <span className="text-sm text-app-text uppercase">{format}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* CSV Options - Only show when CSV format is selected */}
            {exportFormat === 'csv' && (
              <div className="mb-6 p-4 bg-app-surface rounded-lg border border-app-border">
                <h3 className="text-sm font-medium text-app-text mb-3">CSV Options</h3>
                
                {/* Delimiter Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Delimiter
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="csvDelimiter"
                        value=","
                        checked={csvDelimiter === ','}
                        onChange={() => setCsvDelimiter(',')}
                        className="text-app-accent focus:ring-app-accent"
                      />
                      <span className="text-sm text-app-text">Comma (,)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="csvDelimiter"
                        value=";"
                        checked={csvDelimiter === ';'}
                        onChange={() => setCsvDelimiter(';')}
                        className="text-app-accent focus:ring-app-accent"
                      />
                      <span className="text-sm text-app-text">Semicolon (;)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="csvDelimiter"
                        value="\t"
                        checked={csvDelimiter === '\t'}
                        onChange={() => setCsvDelimiter('\t')}
                        className="text-app-accent focus:ring-app-accent"
                      />
                      <span className="text-sm text-app-text">Tab</span>
                    </label>
                  </div>
                </div>

                {/* UTF-8 BOM Toggle */}
                <div className="mb-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={csvBOM}
                      onChange={(e) => setCsvBOM(e.target.checked)}
                      className="text-app-accent focus:ring-app-accent"
                    />
                    <span className="text-sm text-app-text">Include UTF-8 BOM (recommended for Excel)</span>
                  </label>
                  <p className="mt-1 text-xs text-app-text-muted ml-6">
                    Helps Excel recognize UTF-8 encoding automatically
                  </p>
                </div>

                {/* Line Ending Selection */}
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">
                    Line Ending
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="csvLineEnding"
                        value="CRLF"
                        checked={csvLineEnding === 'CRLF'}
                        onChange={() => setCsvLineEnding('CRLF')}
                        className="text-app-accent focus:ring-app-accent"
                      />
                      <span className="text-sm text-app-text">CRLF (Windows, recommended for Excel)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="csvLineEnding"
                        value="LF"
                        checked={csvLineEnding === 'LF'}
                        onChange={() => setCsvLineEnding('LF')}
                        className="text-app-accent focus:ring-app-accent"
                      />
                      <span className="text-sm text-app-text">LF (Unix)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {uploadMode === 'csv' && exportSummary && (
              <ExportModalResultSummary
                exportSummary={exportSummary}
                expanded={summaryExpanded}
                onToggleExpand={() => setSummaryExpanded(!summaryExpanded)}
              />
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-app-text bg-app-card border border-app-border rounded-lg hover:bg-app-surface"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleExport()}
                disabled={exporting || count === 0 || loadingCount || (uploadMode === 'csv' && csvData.length === 0)}
                className="px-4 py-2 text-sm font-medium text-white bg-app-accent rounded-lg hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
    </Modal>
  )
}

