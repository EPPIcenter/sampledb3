import { useEffect, useState } from 'react'
import { studiesApi, type Study } from '../lib/api'

interface StudyPickerProps {
  value?: number
  onChange: (id: number) => void
}

export default function StudyPicker({ value, onChange }: StudyPickerProps) {
  const [open, setOpen] = useState(false)
  const [studies, setStudies] = useState<Study[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const selectedStudy = studies.find((s) => s.id === value)

  useEffect(() => {
    if (open) {
      void loadStudies()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => {
      void loadStudies()
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  const loadStudies = async () => {
    try {
      setLoading(true)
      const response = await studiesApi.list(search || undefined)
      setStudies(response.studies || [])
    } catch (error) {
      console.error('Failed to load studies:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="w-full px-3 py-2 border border-gray-100 rounded-md shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {selectedStudy ? (
          <span className="block truncate">
            {selectedStudy.title} ({selectedStudy.shortCode})
          </span>
        ) : (
          <span className="text-gray-400">Select a study…</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-3xl mx-4 bg-white rounded-lg shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Select Study</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                onClick={() => setOpen(false)}
                aria-label="Close study selection dialog"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <label htmlFor="study-picker-search" className="sr-only">
                Search studies
              </label>
              <input
                id="study-picker-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or short code…"
                className="form-input"
              />
            </div>

            <div className="border border-gray-100 rounded-md max-h-80 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-sm text-gray-500">Loading studies…</div>
              ) : studies.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">No studies found.</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {studies.map((study) => (
                    <li key={study.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        onClick={() => {
                          onChange(study.id)
                          setOpen(false)
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {study.title}
                            </p>
                            <p className="text-xs text-gray-500">
                              {study.shortCode}
                              {study.leadPerson ? ` • Lead: ${study.leadPerson}` : ''}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}


