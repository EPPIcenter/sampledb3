import { useState, useEffect, useRef, type ReactNode } from 'react'
import type { StudySubject } from '../lib/api/types';
import { useClickOutside } from '../hooks/useClickOutside'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useMergeSubjects } from '../hooks/useSubjects'
import { useStudySubjects } from '../hooks/useStudies'
import { Modal, getQueryErrorMessage } from '../ui'
import { parseDisplayDate } from '../lib/date-utils'

/** How many matches a picker lists; typing narrows the search on the server. */
const SUBJECT_SEARCH_LIMIT = 50
const SEARCH_DEBOUNCE_MS = 250

interface SubjectMergeModalProps {
  isOpen: boolean
  onClose: () => void
  studyId: number
  onSuccess: () => void
  /** Pass a key that increments when opening to reset inner state; parent should increment in the open handler. */
  openKey?: number
}

function specimenLabel(count: number): string {
  return `${count} specimen${count !== 1 ? 's' : ''}`
}

/**
 * Search box over a study's subjects. Each keystroke (debounced) searches the API, so every
 * subject in the study can be found, not only one loaded page.
 */
function SubjectPicker({
  inputId,
  label,
  tone,
  studyId,
  excludeId,
  selected,
  onSelect,
}: {
  inputId: string
  label: ReactNode
  tone: 'source' | 'target'
  studyId: number
  excludeId: number | null
  selected: StudySubject | null
  onSelect: (subject: StudySubject | null) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLUListElement>(null)
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)

  const subjectsQuery = useStudySubjects(
    studyId,
    { page: 1, limit: SUBJECT_SEARCH_LIMIT, ...(debouncedSearch ? { search: debouncedSearch } : {}) },
    { enabled: open },
  )
  const results = (subjectsQuery.data?.subjects ?? []).filter((s) => s.id !== excludeId)
  const total = subjectsQuery.data?.pagination?.total ?? results.length

  useClickOutside(containerRef, () => setOpen(false), open)

  useEffect(() => {
    const el = selectedIndex >= 0 ? resultsRef.current?.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null : null
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIndex])

  const choose = (subject: StudySubject) => {
    onSelect(subject)
    setSearch(subject.name)
    setOpen(false)
  }

  const dropdownStyle = {
    position: 'fixed' as const,
    width: containerRef.current?.offsetWidth + 'px' || 'auto',
    top: containerRef.current ? (containerRef.current.getBoundingClientRect().bottom + window.scrollY + 4) + 'px' : 'auto',
    left: containerRef.current ? (containerRef.current.getBoundingClientRect().left + window.scrollX) + 'px' : 'auto',
  }
  const panelClass = 'absolute z-[200] w-full mt-1 bg-app-card border border-app-border rounded-md shadow-lg'
  const messageClass = `${panelClass} p-4 text-sm text-app-text-muted`
  const focusRing = tone === 'source' ? 'focus:ring-app-trend-down focus:border-app-trend-down' : 'focus:ring-app-accent focus:border-app-accent'

  let dropdown: ReactNode = null
  if (open) {
    if (subjectsQuery.isError) {
      dropdown = (
        <div role="alert" className={`${panelClass} p-4 text-sm text-app-trend-down`} style={dropdownStyle}>
          {getQueryErrorMessage(subjectsQuery.error, 'Failed to load subjects')}
        </div>
      )
    } else if (subjectsQuery.isPending) {
      dropdown = <div className={messageClass} style={dropdownStyle}>Searching subjects...</div>
    } else if (results.length === 0) {
      dropdown = (
        <div className={messageClass} style={dropdownStyle}>
          {debouncedSearch ? `No subjects found matching "${debouncedSearch}"` : 'No subjects found in this study'}
        </div>
      )
    } else {
      dropdown = (
        <div className={`${panelClass} max-h-96 overflow-y-auto`} style={dropdownStyle}>
          <ul ref={resultsRef} className="divide-y divide-app-border">
            {results.map((subject, index) => (
              <li key={subject.id}>
                <button
                  type="button"
                  data-index={index}
                  className={`w-full px-4 py-3 text-left hover:bg-app-surface focus:outline-none focus:bg-app-surface ${
                    index === selectedIndex ? 'bg-app-accent-muted' : ''
                  }`}
                  onClick={() => choose(subject)}
                >
                  <p className="text-sm font-medium text-app-text">{subject.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-app-text-muted">ID: {subject.id}</p>
                    {typeof subject.specimenCount === 'number' && (
                      <p className="text-xs text-app-text-muted">{specimenLabel(subject.specimenCount)}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {total > results.length && (
            <p className="px-4 py-2 text-xs text-app-text-muted border-t border-app-border">
              Showing {results.length} of {total.toLocaleString('en-US')}. Type to narrow the search.
            </p>
          )}
        </div>
      )
    }
  }

  return (
    <>
      <label htmlFor={inputId} className="block text-sm font-medium text-app-text mb-2">
        {label}
      </label>
      <div className="relative" ref={containerRef} style={{ zIndex: 200 }}>
        <div className="relative">
          <input
            id={inputId}
            type="text"
            value={selected ? selected.name : search}
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
              setSelectedIndex(0)
              if (selected) onSelect(null)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0))
              } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
                e.preventDefault()
                choose(results[selectedIndex])
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder="Search by name or ID..."
            autoComplete="off"
            className={`w-full px-3 py-2 pr-8 border border-app-border rounded-md shadow-sm focus:outline-none ${focusRing} bg-app-card`}
          />
          <svg
            className="absolute right-2 top-2.5 h-5 w-5 text-app-text-muted pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        {dropdown}
      </div>
      {selected && (
        <div className="mt-3 text-sm">
          <div className="text-app-text-muted">
            Specimens: <span className="font-medium">{selected.specimenCount ?? '...'}</span>
          </div>
          <div className="text-app-text-muted text-xs mt-1">
            Created: {parseDisplayDate(selected.created).toLocaleDateString()}
          </div>
        </div>
      )}
    </>
  )
}

function SubjectMergeModalContent({
  studyId,
  onClose,
  onSuccess,
}: {
  studyId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [sourceSubject, setSourceSubject] = useState<StudySubject | null>(null)
  const [targetSubject, setTargetSubject] = useState<StudySubject | null>(null)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mergeSubjects = useMergeSubjects()
  const sourceSubjectId = sourceSubject?.id ?? null
  const targetSubjectId = targetSubject?.id ?? null
  const sourceSpecimenCount = sourceSubject?.specimenCount ?? null
  const targetSpecimenCount = targetSubject?.specimenCount ?? null

  const handleMerge = async () => {
    if (!sourceSubjectId || !targetSubjectId) {
      setError('Please select both subjects to merge')
      return
    }

    if (sourceSubjectId === targetSubjectId) {
      setError('Source and target subjects must be different')
      return
    }

    try {
      setMerging(true)
      setError(null)
      const response = await mergeSubjects.mutateAsync({ targetId: targetSubjectId, sourceId: sourceSubjectId })
      
      // Show success message
      const { specimensTransferred, specimensMerged, containersMerged, totalContainersTransferred } = response
      const message = `Merge completed successfully!\n` +
        `- ${specimensTransferred} specimen(s) transferred\n` +
        `- ${specimensMerged} specimen(s) merged (containers transferred to existing specimens)\n` +
        `- ${totalContainersTransferred} container(s) moved`
      
      alert(message)
      
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Failed to merge subjects:', err)
      setError(err.response?.data?.error || 'Failed to merge subjects')
    } finally {
      setMerging(false)
    }
  }

  return (
    <>
          <div className="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4 overflow-visible">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-app-text mb-4">
                  Merge Subjects
                </h3>
                
                {error && (
                  <div className="mb-4 p-3 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
                    {error}
                  </div>
                )}

                <div className="mb-6">
                  <p className="text-sm text-app-text-muted mb-4">
                    Select two subjects to merge. All specimens from the source subject will be transferred to the target subject, and the source subject will be deleted.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Source Subject Selection */}
                    <div className="border-2 border-app-trend-down rounded-lg p-4 bg-app-trend-down/10" style={{ position: 'relative', zIndex: 1 }}>
                      <SubjectPicker
                        inputId="merge-source-subject"
                        label={<><span className="text-app-trend-down">Merge FROM</span> (will be deleted)</>}
                        tone="source"
                        studyId={studyId}
                        excludeId={targetSubjectId}
                        selected={sourceSubject}
                        onSelect={setSourceSubject}
                      />
                    </div>

                    {/* Target Subject Selection */}
                    <div className="border-2 border-app-trend-up rounded-lg p-4 bg-app-trend-up/10" style={{ position: 'relative', zIndex: 1 }}>
                      <SubjectPicker
                        inputId="merge-target-subject"
                        label={<><span className="text-app-trend-up">Merge INTO</span> (will be kept)</>}
                        tone="target"
                        studyId={studyId}
                        excludeId={sourceSubjectId}
                        selected={targetSubject}
                        onSelect={setTargetSubject}
                      />
                    </div>
                  </div>
                </div>

                {sourceSubject && targetSubject && (
                  <div className="mb-4 p-4 bg-app-accent-muted border border-app-accent rounded-lg">
                    <h4 className="text-sm font-medium text-app-text mb-3">Merge Preview</h4>
                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-app-text-muted">Source subject:</span>
                        <span className="font-medium text-app-trend-down">{sourceSubject.name}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-app-text-muted">Source specimens:</span>
                        <span className="font-medium">{sourceSpecimenCount ?? '...'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-app-text-muted">Target subject:</span>
                        <span className="font-medium text-app-trend-up">{targetSubject.name}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-app-text-muted">Target specimens:</span>
                        <span className="font-medium">{targetSpecimenCount ?? '...'}</span>
                      </div>
                    </div>
                    <div className="p-2 bg-app-accent-muted border border-app-accent rounded text-xs text-app-text">
                      <strong>Note:</strong> Specimens with matching type and collection date will be merged (containers transferred to existing specimens). Other specimens will be transferred to the target subject.
                    </div>
                  </div>
                )}

                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                  <strong>Warning:</strong> This action cannot be undone. The source subject will be deleted after merging.
                </div>
              </div>
            </div>
          </div>
          <div className="bg-app-surface px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleMerge}
              disabled={!sourceSubjectId || !targetSubjectId || merging || sourceSubjectId === targetSubjectId}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-app-trend-down text-base font-medium text-white hover:bg-app-trend-down/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-trend-down sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {merging ? 'Merging...' : 'Merge Subjects'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={merging}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-app-border shadow-sm px-4 py-2 bg-app-card text-base font-medium text-app-text hover:bg-app-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-accent sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
    </>
  )
}

export default function SubjectMergeModal({
  isOpen,
  onClose,
  studyId,
  onSuccess,
  openKey = 0,
}: SubjectMergeModalProps) {
  if (!isOpen) return null

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      showCloseButton={false}
      overlayClassName="overflow-x-visible"
      panelClassName="sm:max-h-[90vh] overflow-visible"
      contentClassName="overflow-visible"
    >
      <SubjectMergeModalContent
        key={`${studyId}-${openKey}`}
        studyId={studyId}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </Modal>
  )
}

