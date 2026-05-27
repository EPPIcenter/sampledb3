import { useEffect, useState } from 'react'
import { studiesApi } from '../lib/api/studies';
import type { Study } from '../lib/api/studies';
import { Modal } from '../ui'

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

  const loadStudies = async () => {
    try {
      setLoading(true)
      const response = await studiesApi.list(search || undefined)
      setStudies(response.studies)
    } catch (error) {
      console.error('Failed to load studies:', error)
    } finally {
      setLoading(false)
    }
  }

  // Debounced search when query changes (with ignore flag for race conditions)
  useEffect(() => {
    if (!open) return
    let ignore = false
    const timeout = setTimeout(async () => {
      try {
        setLoading(true)
        const response = await studiesApi.list(search || undefined)
        if (!ignore) {
          setStudies(response.studies)
        }
      } catch (error) {
        if (!ignore) {
          console.error('Failed to load studies:', error)
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }, 300)
    return () => {
      ignore = true
      clearTimeout(timeout)
    }
  }, [search, open])

  return (
    <>
      <button
        type="button"
        className="w-full px-3 py-2 border border-app-border rounded-md shadow-sm bg-app-card text-app-text text-left focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-app-accent"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true)
          void loadStudies()
        }}
      >
        {selectedStudy ? (
          <span className="block truncate">
            {selectedStudy.title} ({selectedStudy.shortCode})
          </span>
        ) : (
          <span className="text-app-text-muted">Select a study…</span>
        )}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Select Study"
        size="xl"
        layout="centered"
        panelClassName="border border-app-border"
        contentClassName="p-6"
      >
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

            <div className="border border-app-border rounded-md max-h-80 overflow-y-auto bg-app-card">
              {loading ? (
                <div className="p-4 text-sm text-app-text-muted">Loading studies…</div>
              ) : studies.length === 0 ? (
                <div className="p-4 text-sm text-app-text-muted">No studies found.</div>
              ) : (
                <ul className="divide-y divide-app-border">
                  {studies.map((study) => (
                    <li key={study.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-app-surface focus:outline-none focus:bg-app-surface focus-visible:ring-2 focus-visible:ring-app-accent rounded text-app-text"
                        onClick={() => {
                          onChange(study.id)
                          setOpen(false)
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-app-text">
                              {study.title}
                            </p>
                            <p className="text-xs text-app-text-muted">
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
      </Modal>
    </>
  )
}


