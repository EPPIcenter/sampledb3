import { useState, useEffect, useRef } from 'react'
import { subjectsApi, studiesApi, type StudySubject } from '../lib/api'

interface SubjectMergeModalProps {
  isOpen: boolean
  onClose: () => void
  studyId: number
  onSuccess: () => void
}

export default function SubjectMergeModal({
  isOpen,
  onClose,
  studyId,
  onSuccess,
}: SubjectMergeModalProps) {
  const [subjects, setSubjects] = useState<StudySubject[]>([])
  const [sourceSubjectId, setSourceSubjectId] = useState<number | null>(null)
  const [targetSubjectId, setTargetSubjectId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceSpecimenCount, setSourceSpecimenCount] = useState<number | null>(null)
  const [targetSpecimenCount, setTargetSpecimenCount] = useState<number | null>(null)
  const [loadingCounts, setLoadingCounts] = useState(false)
  const [sourceSearch, setSourceSearch] = useState('')
  const [targetSearch, setTargetSearch] = useState('')
  const [sourceOpen, setSourceOpen] = useState(false)
  const [targetOpen, setTargetOpen] = useState(false)
  const [sourceSelectedIndex, setSourceSelectedIndex] = useState(-1)
  const [targetSelectedIndex, setTargetSelectedIndex] = useState(-1)
  const [specimenCounts, setSpecimenCounts] = useState<Map<number, number>>(new Map())
  const sourceRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef<HTMLDivElement>(null)
  const sourceResultsRef = useRef<HTMLUListElement>(null)
  const targetResultsRef = useRef<HTMLUListElement>(null)

  const getSpecimenCount = (subjectId: number | null): number | null => {
    if (!subjectId) return null
    return specimenCounts.get(subjectId) ?? null
  }

  // Scroll selected item into view
  useEffect(() => {
    if (sourceResultsRef.current && sourceSelectedIndex >= 0) {
      const selectedElement = sourceResultsRef.current.querySelector(
        `[data-index="${sourceSelectedIndex}"]`
      ) as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [sourceSelectedIndex])

  useEffect(() => {
    if (targetResultsRef.current && targetSelectedIndex >= 0) {
      const selectedElement = targetResultsRef.current.querySelector(
        `[data-index="${targetSelectedIndex}"]`
      ) as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [targetSelectedIndex])

  useEffect(() => {
    if (isOpen && studyId) {
      loadSubjects()
      // Reset selections when modal opens
      setSourceSubjectId(null)
      setTargetSubjectId(null)
      setSourceSpecimenCount(null)
      setTargetSpecimenCount(null)
      setError(null)
      setSourceSearch('')
      setTargetSearch('')
      setSourceOpen(false)
      setTargetOpen(false)
      setSourceSelectedIndex(-1)
      setTargetSelectedIndex(-1)
    }
  }, [isOpen, studyId])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sourceRef.current && !sourceRef.current.contains(event.target as Node)) {
        setSourceOpen(false)
      }
      if (targetRef.current && !targetRef.current.contains(event.target as Node)) {
        setTargetOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const loadSubjects = async () => {
    if (!studyId) {
      setError('Study ID is required')
      setLoading(false)
      return
    }
    
    try {
      setLoading(true)
      setError(null)
      const response = await studiesApi.getSubjects(studyId, { page: 1, limit: 1000 })
      setSubjects(response.subjects || [])
      if (!response.subjects || response.subjects.length === 0) {
        setError('No subjects found in this study')
      }
    } catch (err: any) {
      console.error('Failed to load subjects:', err)
      setError(err.response?.data?.error || 'Failed to load subjects')
      setSubjects([])
    } finally {
      setLoading(false)
    }
  }

  // Update selected counts when selections change
  useEffect(() => {
    if (sourceSubjectId) {
      setSourceSpecimenCount(getSpecimenCount(sourceSubjectId))
    } else {
      setSourceSpecimenCount(null)
    }
  }, [sourceSubjectId, specimenCounts])

  useEffect(() => {
    if (targetSubjectId) {
      setTargetSpecimenCount(getSpecimenCount(targetSubjectId))
    } else {
      setTargetSpecimenCount(null)
    }
  }, [targetSubjectId, specimenCounts])

  const loadAllSpecimenCounts = async () => {
    try {
      const counts = new Map<number, number>()
      // Load counts for all subjects in parallel (limit to avoid too many requests)
      const promises = subjects.slice(0, 50).map(async (subject) => {
        try {
          const summary = await subjectsApi.getSummary(subject.id)
          counts.set(subject.id, summary.summary.totalSpecimens)
        } catch (err) {
          console.error(`Failed to load count for subject ${subject.id}:`, err)
          counts.set(subject.id, 0)
        }
      })
      await Promise.all(promises)
      setSpecimenCounts(counts)
    } catch (err) {
      console.error('Failed to load specimen counts:', err)
    }
  }

  // Load specimen counts for all subjects when subjects are loaded
  useEffect(() => {
    if (subjects.length > 0) {
      loadAllSpecimenCounts()
    }
  }, [subjects.length])

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
      const response = await subjectsApi.merge(targetSubjectId, sourceSubjectId)
      
      // Show success message
      const { specimensTransferred, specimensMerged, containersMerged, totalContainersTransferred } = response.data
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

  const sourceSubject = subjects.find(s => s.id === sourceSubjectId)
  const targetSubject = subjects.find(s => s.id === targetSubjectId)
  
  // Filter subjects for dropdowns - exclude the other selected subject and filter by search
  const availableSourceSubjects = subjects
    .filter(s => s.id !== targetSubjectId)
    .filter(s => {
      if (!sourceSearch) return true
      const searchLower = sourceSearch.toLowerCase()
      return s.name.toLowerCase().includes(searchLower) || 
             s.id.toString().includes(searchLower)
    })
  
  const availableTargetSubjects = subjects
    .filter(s => s.id !== sourceSubjectId)
    .filter(s => {
      if (!targetSearch) return true
      const searchLower = targetSearch.toLowerCase()
      return s.name.toLowerCase().includes(searchLower) || 
             s.id.toString().includes(searchLower)
    })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto overflow-x-visible">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
          onClick={onClose}
        />
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-lg text-left shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full sm:max-h-[90vh] relative z-10 overflow-visible">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 overflow-visible">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Merge Subjects
                </h3>
                
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <div className="mb-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Select two subjects to merge. All specimens from the source subject will be transferred to the target subject, and the source subject will be deleted.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Source Subject Selection */}
                    <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50" style={{ position: 'relative', zIndex: 1 }}>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        <span className="text-red-700">Merge FROM</span> (will be deleted)
                      </label>
                      {loading ? (
                        <div className="text-sm text-gray-500 py-2">Loading subjects...</div>
                      ) : (
                        <div className="relative" ref={sourceRef} style={{ zIndex: 200 }}>
                          <div className="relative">
                            <input
                              type="text"
                              value={sourceSubject ? sourceSubject.name : sourceSearch}
                              onChange={(e) => {
                                setSourceSearch(e.target.value)
                                setSourceOpen(true)
                                setSourceSelectedIndex(0)
                                if (!e.target.value) {
                                  setSourceSubjectId(null)
                                }
                              }}
                              onFocus={() => setSourceOpen(true)}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  setSourceSelectedIndex(prev => 
                                    prev < availableSourceSubjects.length - 1 ? prev + 1 : prev
                                  )
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault()
                                  setSourceSelectedIndex(prev => prev > 0 ? prev - 1 : 0)
                                } else if (e.key === 'Enter' && sourceSelectedIndex >= 0) {
                                  e.preventDefault()
                                  const selected = availableSourceSubjects[sourceSelectedIndex]
                                  if (selected) {
                                    setSourceSubjectId(selected.id)
                                    setSourceSearch(selected.name)
                                    setSourceOpen(false)
                                  }
                                } else if (e.key === 'Escape') {
                                  setSourceOpen(false)
                                }
                              }}
                              placeholder="Search by name or ID..."
                              className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 bg-white"
                            />
                            <svg
                              className="absolute right-2 top-2.5 h-5 w-5 text-gray-400 pointer-events-none"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                          {sourceOpen && availableSourceSubjects.length > 0 && (
                            <div 
                              className="absolute z-[200] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-y-auto"
                              style={{ 
                                position: 'fixed',
                                width: sourceRef.current?.offsetWidth + 'px' || 'auto',
                                top: sourceRef.current ? (sourceRef.current.getBoundingClientRect().bottom + window.scrollY + 4) + 'px' : 'auto',
                                left: sourceRef.current ? (sourceRef.current.getBoundingClientRect().left + window.scrollX) + 'px' : 'auto'
                              }}
                            >
                              <ul ref={sourceResultsRef} className="divide-y divide-gray-200">
                                {availableSourceSubjects.map((subject, index) => {
                                  const count = getSpecimenCount(subject.id)
                                  return (
                                    <li key={subject.id}>
                                      <button
                                        type="button"
                                        data-index={index}
                                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50 ${
                                          index === sourceSelectedIndex ? 'bg-blue-50' : ''
                                        }`}
                                        onClick={() => {
                                          setSourceSubjectId(subject.id)
                                          setSourceSearch(subject.name)
                                          setSourceOpen(false)
                                        }}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-900">{subject.name}</p>
                                            <div className="flex items-center gap-3 mt-1">
                                              <p className="text-xs text-gray-500">ID: {subject.id}</p>
                                              {count !== null && (
                                                <p className="text-xs text-gray-500">
                                                  {count} specimen{count !== 1 ? 's' : ''}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </button>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          )}
                          {sourceOpen && sourceSearch && availableSourceSubjects.length === 0 && (
                            <div 
                              className="absolute z-[200] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-sm text-gray-500"
                              style={{ 
                                position: 'fixed',
                                width: sourceRef.current?.offsetWidth + 'px' || 'auto',
                                top: sourceRef.current ? (sourceRef.current.getBoundingClientRect().bottom + window.scrollY + 4) + 'px' : 'auto',
                                left: sourceRef.current ? (sourceRef.current.getBoundingClientRect().left + window.scrollX) + 'px' : 'auto'
                              }}
                            >
                              No subjects found matching "{sourceSearch}"
                            </div>
                          )}
                        </div>
                      )}
                      {sourceSubject && (
                        <div className="mt-3 text-sm">
                          <div className="text-gray-600">
                            Specimens: <span className="font-medium">{sourceSpecimenCount ?? '...'}</span>
                          </div>
                          <div className="text-gray-500 text-xs mt-1">
                            Created: {new Date(sourceSubject.created).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Target Subject Selection */}
                    <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50" style={{ position: 'relative', zIndex: 1 }}>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        <span className="text-green-700">Merge INTO</span> (will be kept)
                      </label>
                      {loading ? (
                        <div className="text-sm text-gray-500 py-2">Loading subjects...</div>
                      ) : (
                        <div className="relative" ref={targetRef} style={{ zIndex: 200 }}>
                          <div className="relative">
                            <input
                              type="text"
                              value={targetSubject ? targetSubject.name : targetSearch}
                              onChange={(e) => {
                                setTargetSearch(e.target.value)
                                setTargetOpen(true)
                                setTargetSelectedIndex(0)
                                if (!e.target.value) {
                                  setTargetSubjectId(null)
                                }
                              }}
                              onFocus={() => setTargetOpen(true)}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  setTargetSelectedIndex(prev => 
                                    prev < availableTargetSubjects.length - 1 ? prev + 1 : prev
                                  )
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault()
                                  setTargetSelectedIndex(prev => prev > 0 ? prev - 1 : 0)
                                } else if (e.key === 'Enter' && targetSelectedIndex >= 0) {
                                  e.preventDefault()
                                  const selected = availableTargetSubjects[targetSelectedIndex]
                                  if (selected) {
                                    setTargetSubjectId(selected.id)
                                    setTargetSearch(selected.name)
                                    setTargetOpen(false)
                                  }
                                } else if (e.key === 'Escape') {
                                  setTargetOpen(false)
                                }
                              }}
                              placeholder="Search by name or ID..."
                              className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 bg-white"
                            />
                            <svg
                              className="absolute right-2 top-2.5 h-5 w-5 text-gray-400 pointer-events-none"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                          {targetOpen && availableTargetSubjects.length > 0 && (
                            <div 
                              className="absolute z-[200] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-y-auto"
                              style={{ 
                                position: 'fixed',
                                width: targetRef.current?.offsetWidth + 'px' || 'auto',
                                top: targetRef.current ? (targetRef.current.getBoundingClientRect().bottom + window.scrollY + 4) + 'px' : 'auto',
                                left: targetRef.current ? (targetRef.current.getBoundingClientRect().left + window.scrollX) + 'px' : 'auto'
                              }}
                            >
                              <ul ref={targetResultsRef} className="divide-y divide-gray-200">
                                {availableTargetSubjects.map((subject, index) => {
                                  const count = getSpecimenCount(subject.id)
                                  return (
                                    <li key={subject.id}>
                                      <button
                                        type="button"
                                        data-index={index}
                                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50 ${
                                          index === targetSelectedIndex ? 'bg-blue-50' : ''
                                        }`}
                                        onClick={() => {
                                          setTargetSubjectId(subject.id)
                                          setTargetSearch(subject.name)
                                          setTargetOpen(false)
                                        }}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-900">{subject.name}</p>
                                            <div className="flex items-center gap-3 mt-1">
                                              <p className="text-xs text-gray-500">ID: {subject.id}</p>
                                              {count !== null && (
                                                <p className="text-xs text-gray-500">
                                                  {count} specimen{count !== 1 ? 's' : ''}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </button>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          )}
                          {targetOpen && targetSearch && availableTargetSubjects.length === 0 && (
                            <div 
                              className="absolute z-[200] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-sm text-gray-500"
                              style={{ 
                                position: 'fixed',
                                width: targetRef.current?.offsetWidth + 'px' || 'auto',
                                top: targetRef.current ? (targetRef.current.getBoundingClientRect().bottom + window.scrollY + 4) + 'px' : 'auto',
                                left: targetRef.current ? (targetRef.current.getBoundingClientRect().left + window.scrollX) + 'px' : 'auto'
                              }}
                            >
                              No subjects found matching "{targetSearch}"
                            </div>
                          )}
                        </div>
                      )}
                      {targetSubject && (
                        <div className="mt-3 text-sm">
                          <div className="text-gray-600">
                            Specimens: <span className="font-medium">{targetSpecimenCount ?? '...'}</span>
                          </div>
                          <div className="text-gray-500 text-xs mt-1">
                            Created: {new Date(targetSubject.created).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {sourceSubject && targetSubject && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Merge Preview</h4>
                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Source subject:</span>
                        <span className="font-medium text-red-700">{sourceSubject.name}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Source specimens:</span>
                        <span className="font-medium">{sourceSpecimenCount ?? '...'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Target subject:</span>
                        <span className="font-medium text-green-700">{targetSubject.name}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Target specimens:</span>
                        <span className="font-medium">{targetSpecimenCount ?? '...'}</span>
                      </div>
                    </div>
                    <div className="p-2 bg-blue-100 border border-blue-300 rounded text-xs text-blue-900">
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
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleMerge}
              disabled={!sourceSubjectId || !targetSubjectId || merging || sourceSubjectId === targetSubjectId}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {merging ? 'Merging...' : 'Merge Subjects'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={merging}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

