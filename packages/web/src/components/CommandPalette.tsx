import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useHotkey } from '../hooks/useHotkey'
import { Command, filterCommands, groupCommandsByCategory } from '../lib/commands'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  commands: Command[]
}

export default function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Close on Escape
  useHotkey('escape', () => {
    if (isOpen) {
      onClose()
    }
  }, { enabled: isOpen, enableOnFormTags: true })

  // Filter commands based on query and current route
  const filteredCommands = useMemo(() => {
    return filterCommands(commands, query, location.pathname)
  }, [commands, query, location.pathname])

  // Group filtered commands by category
  const groupedCommands = useMemo(() => {
    return groupCommandsByCategory(filteredCommands)
  }, [filteredCommands])

  // Flatten commands for keyboard navigation
  const flatCommands = useMemo(() => {
    return filteredCommands
  }, [filteredCommands])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      setQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && flatCommands.length > 0) {
      const selectedElement = resultsRef.current.querySelector(
        `[data-command-index="${selectedIndex}"]`
      ) as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex, flatCommands.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev < flatCommands.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatCommands[selectedIndex]) {
        executeCommand(flatCommands[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const executeCommand = (command: Command) => {
    try {
      command.action()
      onClose()
      setQuery('')
    } catch (error) {
      console.error('Error executing command:', error)
    }
  }

  const highlightText = (text: string, query: string) => {
    if (!query) return text

    const lowerQuery = query.toLowerCase()
    const lowerText = text.toLowerCase()
    const index = lowerText.indexOf(lowerQuery)

    if (index === -1) return text

    return (
      <>
        {text.substring(0, index)}
        <mark>{text.substring(index, index + query.length)}</mark>
        {text.substring(index + query.length)}
      </>
    )
  }

  if (!isOpen) return null

  return (
    <div className="palette-overlay">
      <div
        className="palette-overlay__backdrop"
        onClick={onClose}
        aria-hidden
      />
      <div className="palette-panel sm:my-8 sm:max-w-2xl">
        <div className="palette-panel__inner">
          <div className="palette-input-wrap">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search..."
              className="palette-input"
              autoFocus
              aria-label="Command palette"
            />
          </div>

          <div ref={resultsRef} className="palette-results">
            {Object.keys(groupedCommands).length === 0 ? (
              <div className="palette-empty">
                <p>No commands found</p>
                <p>Try a different search term</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                  <div key={category}>
                    <h4 className="palette-group-title">{category}</h4>
                    <div className="palette-list">
                      {categoryCommands.map((command) => {
                        const flatIndex = flatCommands.indexOf(command)
                        const isSelected = flatIndex === selectedIndex

                        return (
                          <button
                            key={command.id}
                            type="button"
                            data-command-index={flatIndex}
                            onClick={() => executeCommand(command)}
                            onMouseEnter={() => setSelectedIndex(flatIndex)}
                            className={`palette-item ${isSelected ? 'palette-item--selected' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="palette-item__title">
                                  {highlightText(command.label, query)}
                                </div>
                                {command.description && (
                                  <div className="palette-item__subtitle">{command.description}</div>
                                )}
                              </div>
                              {command.icon && (
                                <div className="ml-4 flex-shrink-0 opacity-60 [&_svg]:w-5 [&_svg]:h-5">
                                  {command.icon}
                                </div>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="palette-footer">
            <div className="palette-footer__hints">
              <div className="palette-footer__hint">
                <kbd className="palette-kbd">↑↓</kbd>
                <span>Navigate</span>
              </div>
              <div className="palette-footer__hint">
                <kbd className="palette-kbd">Enter</kbd>
                <span>Select</span>
              </div>
              <div className="palette-footer__hint">
                <kbd className="palette-kbd">Esc</kbd>
                <span>Close</span>
              </div>
            </div>
            <span className="text-xs">
              {flatCommands.length} {flatCommands.length === 1 ? 'command' : 'commands'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

