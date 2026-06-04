import type { StudySubject } from '../lib/api/types'
import { useStudyExportModalController } from '../hooks/useStudyExportModalController'
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
  const {
    error,
    modeTabs,
    csvUpload,
    filters,
    countPreview,
    configPicker,
    format,
    summary,
    actionBar,
  } = useStudyExportModalController({ studyCode, isOpen, onClose })

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

      <ExportModalModeTabs uploadMode={modeTabs.uploadMode} onSwitchMode={modeTabs.onSwitchMode} />

      {modeTabs.uploadMode === 'csv' && (
        <ExportModalCsvUploadSection
          csvError={csvUpload.csvError}
          csvDataLength={csvUpload.csvDataLength}
          dateTolerance={csvUpload.dateTolerance}
          onUpload={csvUpload.onUpload}
          onDateToleranceChange={csvUpload.onDateToleranceChange}
        />
      )}

      <ExportModalFiltersPanel
        uploadMode={filters.uploadMode}
        filters={filters.filters}
        specimenTypes={filters.specimenTypes}
        tags={filters.tags}
        availableContainerTypes={filters.availableContainerTypes}
        subjects={subjects}
        loadingRefData={filters.loadingRefData}
        hasActiveFilters={filters.hasActiveFilters}
        onUpdateFilter={filters.onUpdateFilter}
        onToggleArrayFilter={filters.onToggleArrayFilter}
        onClearFilters={filters.onClearFilters}
      />

      <ExportModalCountPreview count={countPreview.count} loadingCount={countPreview.loadingCount} />

      <ExportModalConfigPicker
        exportConfigurations={configPicker.exportConfigurations}
        selectedConfigId={configPicker.selectedConfigId}
        loadingConfigs={configPicker.loadingConfigs}
        focusedConfigIndex={configPicker.focusedConfigIndex}
        onSelectConfig={configPicker.onSelectConfig}
        onFocusConfig={configPicker.onFocusConfig}
      />

      <ExportModalFormatSection
        exportFormat={format.exportFormat}
        csvDelimiter={format.csvDelimiter}
        csvBOM={format.csvBOM}
        csvLineEnding={format.csvLineEnding}
        onExportFormatChange={format.onExportFormatChange}
        onCsvDelimiterChange={format.onCsvDelimiterChange}
        onCsvBOMChange={format.onCsvBOMChange}
        onCsvLineEndingChange={format.onCsvLineEndingChange}
      />

      {summary && (
        <ExportModalResultSummary
          exportSummary={summary.exportSummary}
          expanded={summary.expanded}
          onToggleExpand={summary.onToggleExpand}
        />
      )}

      <ExportModalActionBar
        exporting={actionBar.exporting}
        count={actionBar.count}
        loadingCount={actionBar.loadingCount}
        uploadMode={actionBar.uploadMode}
        csvDataLength={actionBar.csvDataLength}
        onCancel={actionBar.onCancel}
        onExport={actionBar.onExport}
      />
    </Modal>
  )
}
