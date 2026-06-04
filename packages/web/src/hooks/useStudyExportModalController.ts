import { useCallback, useEffect, useState } from 'react'
import { exportApi } from '../lib/api/export'
import { tagsApi } from '../lib/api/reference-data'
import type { Tag } from '../lib/api/reference-data'
import type { SpecimenType } from '../lib/api/types'
import { useExportConfigurations } from './useExportConfigurations'
import { useSingleStudyExportWorkflow } from './useSingleStudyExportWorkflow'
import { getExportColumnsForConfigId } from '../lib/export-config-selection'
import { useModifierHotkey } from './useHotkey'

export function useStudyExportModalController(options: {
  studyCode: string
  isOpen: boolean
  onClose: () => void
}) {
  const { studyCode, isOpen, onClose } = options

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

  const error = refDataError || workflowError

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
        })),
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
    void loadReferenceData()
    void loadExportConfigurations()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when modal opens for a study
  }, [isOpen, studyCode])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleExport = useCallback(async () => {
    const result = await submitExport({
      columns: getExportColumnsForConfigId(exportConfigurations, selectedConfigId) ?? [],
    })
    if (result === 'close') {
      setTimeout(() => onClose(), 1000)
    }
  }, [submitExport, exportConfigurations, selectedConfigId, onClose])

  useModifierHotkey(
    'enter',
    (e) => {
      if (isOpen && !exporting && count !== 0 && !loadingCount) {
        e.preventDefault()
        void handleExport()
      }
    },
    { enabled: isOpen, preventDefault: true },
  )

  return {
    error,
    modeTabs: {
      uploadMode,
      onSwitchMode: switchUploadMode,
    },
    csvUpload: {
      csvError,
      csvDataLength: csvData.length,
      dateTolerance,
      onUpload: handleCSVUpload,
      onDateToleranceChange: updateDateTolerance,
    },
    filters: {
      uploadMode,
      filters,
      specimenTypes,
      tags,
      availableContainerTypes,
      loadingRefData,
      hasActiveFilters: hasActiveFilters(),
      onUpdateFilter: updateFilter,
      onToggleArrayFilter: toggleArrayFilter,
      onClearFilters: clearFilters,
    },
    countPreview: {
      count,
      loadingCount,
    },
    configPicker: {
      exportConfigurations,
      selectedConfigId,
      loadingConfigs,
      focusedConfigIndex,
      onSelectConfig: (configId: string, index: number) => {
        setSelectedConfigId(configId)
        setFocusedConfigIndex(index)
      },
      onFocusConfig: setFocusedConfigIndex,
    },
    format: {
      exportFormat,
      csvDelimiter,
      csvBOM,
      csvLineEnding,
      onExportFormatChange: setExportFormat,
      onCsvDelimiterChange: setCsvDelimiter,
      onCsvBOMChange: setCsvBOM,
      onCsvLineEndingChange: setCsvLineEnding,
    },
    summary:
      uploadMode === 'csv' && exportSummary
        ? {
            exportSummary,
            expanded: summaryExpanded,
            onToggleExpand: () => setSummaryExpanded(!summaryExpanded),
          }
        : null,
    actionBar: {
      exporting,
      count,
      loadingCount,
      uploadMode,
      csvDataLength: csvData.length,
      onCancel: onClose,
      onExport: () => void handleExport(),
    },
  }
}
