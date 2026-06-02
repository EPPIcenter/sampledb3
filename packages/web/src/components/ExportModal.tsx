import { useState, useEffect, useCallback } from 'react'
import { exportApi } from '../lib/api/export'
import { tagsApi } from '../lib/api/reference-data'
import type { Tag } from '../lib/api/reference-data'
import type { SpecimenType, StudySubject } from '../lib/api/types'
import { useExportConfigurations } from '../hooks/useExportConfigurations'
import { useSingleStudyExportWorkflow } from '../hooks/useSingleStudyExportWorkflow'
import { getExportColumnsForConfigId } from '../lib/export-config-selection'
import { useModifierHotkey } from '../hooks/useHotkey'
import { Modal } from '../ui'
import ExportModalResultSummary from './ExportModalResultSummary'
import ExportModalModeTabs from './export-modal/ExportModalModeTabs'
import ExportModalCsvUploadSection from './export-modal/ExportModalCsvUploadSection'
import ExportModalFiltersPanel from './export-modal/ExportModalFiltersPanel'
import ExportModalCountPreview from './export-modal/ExportModalCountPreview'
import ExportModalConfigPicker from './export-modal/ExportModalConfigPicker'
import ExportModalFormatSection from './export-modal/ExportModalFormatSection'
import ExportModalActionBar from './export-modal/ExportModalActionBar'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  studyCode: string
  studyId: number
  subjects?: StudySubject[]
}

export default function ExportModal({
  isOpen,
  onClose,
  studyCode,
  studyId: _studyId,
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
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleExport = async () => {
    const result = await submitExport({
      columns: getExportColumnsForConfigId(exportConfigurations, selectedConfigId) ?? [],
    })
    if (result === 'close') {
      setTimeout(() => onClose(), 1000)
    }
  }

  useModifierHotkey(
    'enter',
    (e) => {
      if (isOpen && !exporting && count !== 0 && !loadingCount) {
        e.preventDefault()
        void handleExport()
      }
    },
    { enabled: isOpen, preventDefault: true }
  )

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
        <button type="button" onClick={onClose} className="text-app-text-muted hover:text-app-text">
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

      <ExportModalModeTabs uploadMode={uploadMode} onSwitchMode={switchUploadMode} />

      {uploadMode === 'csv' && (
        <ExportModalCsvUploadSection
          csvError={csvError}
          csvDataLength={csvData.length}
          dateTolerance={dateTolerance}
          onUpload={handleCSVUpload}
          onDateToleranceChange={updateDateTolerance}
        />
      )}

      <ExportModalFiltersPanel
        uploadMode={uploadMode}
        filters={filters}
        specimenTypes={specimenTypes}
        tags={tags}
        availableContainerTypes={availableContainerTypes}
        subjects={subjects}
        loadingRefData={loadingRefData}
        hasActiveFilters={hasActiveFilters()}
        onUpdateFilter={updateFilter}
        onToggleArrayFilter={toggleArrayFilter}
        onClearFilters={clearFilters}
      />

      <ExportModalCountPreview count={count} loadingCount={loadingCount} />

      <ExportModalConfigPicker
        exportConfigurations={exportConfigurations}
        selectedConfigId={selectedConfigId}
        loadingConfigs={loadingConfigs}
        focusedConfigIndex={focusedConfigIndex}
        onSelectConfig={(configId, index) => {
          setSelectedConfigId(configId)
          setFocusedConfigIndex(index)
        }}
        onFocusConfig={setFocusedConfigIndex}
      />

      <ExportModalFormatSection
        exportFormat={exportFormat}
        csvDelimiter={csvDelimiter}
        csvBOM={csvBOM}
        csvLineEnding={csvLineEnding}
        onExportFormatChange={setExportFormat}
        onCsvDelimiterChange={setCsvDelimiter}
        onCsvBOMChange={setCsvBOM}
        onCsvLineEndingChange={setCsvLineEnding}
      />

      {uploadMode === 'csv' && exportSummary && (
        <ExportModalResultSummary
          exportSummary={exportSummary}
          expanded={summaryExpanded}
          onToggleExpand={() => setSummaryExpanded(!summaryExpanded)}
        />
      )}

      <ExportModalActionBar
        exporting={exporting}
        count={count}
        loadingCount={loadingCount}
        uploadMode={uploadMode}
        csvDataLength={csvData.length}
        onCancel={onClose}
        onExport={() => void handleExport()}
      />
    </Modal>
  )
}
