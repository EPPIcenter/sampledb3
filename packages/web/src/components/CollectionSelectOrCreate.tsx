import { useState, useRef, useMemo, useEffect } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import LocationPicker from './LocationPicker'
import ModalPortal from './ModalPortal'
import { collectionsApi } from '../lib/api'

const MAX_SUGGESTIONS = 25

export interface CollectionOption {
  id: number
  name: string
  locationPath?: string | null
}

export interface CollectionSelectValue {
  id?: number
  name: string
  locationPath?: string | null
}

export type CollectionType = 'box' | 'bag' | 'micronix_plate' | 'cryovial_box' | 'sheet'

interface CollectionSelectOrCreateProps {
  collectionType: CollectionType
  collections: CollectionOption[]
  value: CollectionSelectValue | null
  onChange: (value: CollectionSelectValue | null) => void
  allowCreate?: boolean
  label?: string
  placeholder?: string
  disabled?: boolean
  id?: string
}

function filterAndSort(
  collections: CollectionOption[],
  query: string
): CollectionOption[] {
  if (!query.trim()) {
    return collections.slice(0, MAX_SUGGESTIONS)
  }
  const q = query.trim().toLowerCase()
  const matches = collections.filter((c) =>
    c.name.toLowerCase().includes(q)
  )
  matches.sort((a, b) => {
    const al = a.name.toLowerCase()
    const bl = b.name.toLowerCase()
    const aRank = al === q ? 0 : al.startsWith(q) ? 1 : 2
    const bRank = bl === q ? 0 : bl.startsWith(q) ? 1 : 2
    return aRank - bRank || al.localeCompare(bl)
  })
  return matches.slice(0, MAX_SUGGESTIONS)
}

function getCreateEndpoint(
  collectionType: CollectionType
): 'createBox' | 'createBag' | 'createMicronixPlate' | 'createCryovialBox' {
  switch (collectionType) {
    case 'box':
      return 'createBox'
    case 'bag':
      return 'createBag'
    case 'micronix_plate':
      return 'createMicronixPlate'
    case 'cryovial_box':
      return 'createCryovialBox'
    default:
      return 'createBox'
  }
}

export default function CollectionSelectOrCreate({
  collectionType,
  collections,
  value,
  onChange,
  allowCreate = false,
  label,
  placeholder = 'Type to search or enter name',
  disabled = false,
  id: propId = 'collection-select-or-create',
}: CollectionSelectOrCreateProps) {
  const [inputText, setInputText] = useState(value?.name ?? '')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalName, setModalName] = useState('')
  const [modalLocationId, setModalLocationId] = useState<number | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const query = inputText.trim().toLowerCase()
  const filtered = useMemo(
    () => filterAndSort(collections, inputText),
    [collections, inputText]
  )
  const noSelection = value == null || value.id == null
  const showDropdown = dropdownOpen && filtered.length > 0 && noSelection

  const selected = value != null && value.id != null

  useEffect(() => {
    if (!showDropdown) return
    const el = containerRef.current?.querySelector(
      `[data-suggestion-index="${highlightIndex}"]`
    )
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      (el as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [showDropdown, highlightIndex])

  useClickOutside(containerRef, () => setDropdownOpen(false), dropdownOpen)

  const resetHighlight = () => setHighlightIndex(0)

  const handleBlur = () => {
    setTimeout(() => setDropdownOpen(false), 150)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) {
      if (e.key === 'Escape') setDropdownOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) =>
        i < filtered.length - 1 ? i + 1 : 0
      )
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) =>
        i > 0 ? i - 1 : filtered.length - 1
      )
      return
    }
    if (e.key === 'Enter' && filtered[highlightIndex]) {
      e.preventDefault()
      const c = filtered[highlightIndex]
      onChange({
        id: c.id,
        name: c.name,
        locationPath: c.locationPath ?? null,
      })
      setDropdownOpen(false)
      return
    }
    if (e.key === 'Escape') {
      setDropdownOpen(false)
    }
  }

  const handleOpenCreateModal = () => {
    setModalName(inputText.trim() || '')
    setModalLocationId(null)
    setCreateError(null)
    setModalOpen(true)
  }

  const handleCreateSubmit = async () => {
    if (!modalName.trim() || modalLocationId === null) return
    if (collectionType === 'sheet') {
      setCreateError('Creating sheets from this control is not supported.')
      return
    }
    setCreateError(null)
    try {
      const endpoint = getCreateEndpoint(collectionType)
      const res = await collectionsApi[endpoint]({
        name: modalName.trim(),
        locationId: modalLocationId,
      })
      const data = res.data as {
        box?: { id: number; name: string; location?: { path: string | null } | null; locationPath?: string | null }
        bag?: { id: number; name: string; location?: { path: string | null } | null; locationPath?: string | null }
        plate?: { id: number; name: string; location?: { path: string | null } | null; locationPath?: string | null }
      }
      const created = data.box ?? data.bag ?? data.plate
      if (!created) throw new Error('Create did not return collection')
      const path = created.locationPath ?? created.location?.path ?? null
      onChange({
        id: created.id,
        name: created.name,
        locationPath: path,
      })
      setModalOpen(false)
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data
              ?.error ?? 'Failed to create collection'
          : err instanceof Error
            ? err.message
            : 'Failed to create collection'
      setCreateError(message)
    }
  }

  const listboxId = `${propId}-listbox`
  const optionId = (i: number) => `${propId}-option-${i}`

  return (
    <div ref={containerRef} className="relative">
      {label != null && (
        <label
          htmlFor={propId}
          className="blood-controls-filter-label block mb-1"
        >
          {label}
        </label>
      )}

      {selected ? (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-0 rounded-lg border border-app-trend-up/30 bg-app-trend-up/10 px-3 py-2 text-sm text-app-text">
            {value.locationPath != null && value.locationPath !== '' ? (
              <>Selected: {value.name} at {value.locationPath}</>
            ) : (
              <>Selected: {value.name}</>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setInputText('')
              onChange(null)
            }}
            disabled={disabled}
            className="text-sm text-app-accent underline hover:no-underline shrink-0"
          >
            Clear
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 items-center">
            <div className="flex-1 relative">
              <input
                id={propId}
                type="text"
                value={
                  value != null && value.id == null
                    ? value.name
                    : inputText
                }
                onChange={(e) => {
                  const v = e.target.value
                  setInputText(v)
                  setDropdownOpen(true)
                  resetHighlight()
                  onChange(v.trim() ? { name: v, id: undefined, locationPath: undefined } : null)
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={placeholder}
                autoComplete="off"
                role="combobox"
                aria-expanded={showDropdown}
                aria-autocomplete="list"
                aria-controls={showDropdown ? listboxId : undefined}
                aria-activedescendant={
                  showDropdown ? optionId(highlightIndex) : undefined
                }
                className="block w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-card text-app-text"
              />
            </div>
            {allowCreate && (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                disabled={disabled}
                className="px-3 py-2 text-sm border border-app-border rounded-lg text-app-text hover:bg-app-surface disabled:opacity-50"
              >
                Create new collection
              </button>
            )}
          </div>

          {showDropdown && (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-app-border bg-app-card shadow-lg py-1 text-sm"
            >
              {filtered.map((c, index) => (
                <li
                  key={c.id}
                  data-suggestion-index={index}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === highlightIndex}
                  className={`px-3 py-2 cursor-pointer ${
                    index === highlightIndex
                      ? 'bg-app-accent-muted text-app-text'
                      : 'text-app-text hover:bg-app-surface'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange({
                      id: c.id,
                      name: c.name,
                      locationPath: c.locationPath ?? null,
                    })
                    setDropdownOpen(false)
                  }}
                >
                  <span className="font-medium">{c.name}</span>
                  {c.locationPath != null && c.locationPath !== '' && (
                    <span className="block text-xs text-app-text-muted mt-0.5">
                      {c.locationPath}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {modalOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-collection-modal-title"
          >
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setModalOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-lg mx-4 bg-app-card rounded-lg shadow-xl p-6">
              <h3
                id="create-collection-modal-title"
                className="text-lg font-semibold mb-4 text-app-text"
              >
                Create new collection
              </h3>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="create-collection-name"
                    className="block text-sm font-medium text-app-text mb-1"
                  >
                    Name *
                  </label>
                  <input
                    id="create-collection-name"
                    type="text"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    className="block w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-card text-app-text"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-app-text mb-1">
                    Location *
                  </label>
                  <LocationPicker
                    value={modalLocationId}
                    onChange={(id) => setModalLocationId(id)}
                    filterCollectionsOnly
                  />
                </div>
                {createError && (
                  <p className="text-sm text-app-trend-down" role="alert">
                    {createError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSubmit}
                    disabled={!modalName.trim() || modalLocationId === null}
                    className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
