import { useState, useRef, useEffect } from 'react'

const MAX_SUGGESTIONS = 25

interface CollectionNameSearchProps {
  value: string
  onChange: (name: string) => void
  /** All collection names for the current type (in memory, search is client-side). */
  options: string[]
  id?: string
  label?: string
  placeholder?: string
  disabled?: boolean
}

/**
 * Combobox: text input with dropdown of matching collection names.
 * Filters options by case-insensitive substring. Allows free text (new names).
 */
export default function CollectionNameSearch({
  value,
  onChange,
  options,
  id = 'collection-name-search',
  label,
  placeholder = 'Type to search or enter name',
  disabled = false,
}: CollectionNameSearchProps) {
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const query = value.trim().toLowerCase()
  const filtered =
    query === ''
      ? options.slice(0, MAX_SUGGESTIONS)
      : (() => {
          const matches = options.filter((n) => n.toLowerCase().includes(query))
          // Prioritize: exact match first, then starts-with, then other substring matches
          matches.sort((a, b) => {
            const al = a.toLowerCase()
            const bl = b.toLowerCase()
            const aExact = al === query ? 0 : al.startsWith(query) ? 1 : 2
            const bExact = bl === query ? 0 : bl.startsWith(query) ? 1 : 2
            return aExact - bExact || al.localeCompare(bl)
          })
          return matches.slice(0, MAX_SUGGESTIONS)
        })()

  const showDropdown = open && filtered.length > 0

  useEffect(() => {
    setHighlightIndex(0)
  }, [value, filtered.length])

  useEffect(() => {
    if (!showDropdown) return
    const el = containerRef.current?.querySelector(`[data-suggestion-index="${highlightIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [showDropdown, highlightIndex])

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 150)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Escape') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : 0))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => (i > 0 ? i - 1 : filtered.length - 1))
      return
    }
    if (e.key === 'Enter' && filtered[highlightIndex] != null) {
      e.preventDefault()
      onChange(filtered[highlightIndex])
      setOpen(false)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {label != null && (
        <label htmlFor={id} className="blood-controls-filter-label block mb-1">
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-controls={showDropdown ? `${id}-listbox` : undefined}
        aria-activedescendant={showDropdown ? `${id}-option-${highlightIndex}` : undefined}
        className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
      {showDropdown && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm"
        >
          {filtered.map((name, index) => (
            <li
              key={name}
              data-suggestion-index={index}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === highlightIndex}
              className={`px-3 py-2 cursor-pointer ${
                index === highlightIndex ? 'bg-teal-50 text-teal-900' : 'text-gray-900 hover:bg-gray-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(name)
                setOpen(false)
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
