import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useHotkey } from '../hooks/useHotkey'
import { Command, filterCommands, groupCommandsByCategory } from '../lib/commands'
import { getModifierKey, formatHotkey } from '../lib/hotkeys'

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
  const navigate = useNavigate()

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
        <mark className="bg-yellow-200">{text.substring(index, index + query.length)}</mark>
        {text.substring(index + query.length)}
      </>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {/* Search input */}
            <div className="mb-4 relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or search..."
                className="w-full form-input pl-10 h-12 text-lg"
                autoFocus
              />
              <svg
                className="absolute left-3 top-3 h-6 w-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            {/* Results */}
            <div
              ref={resultsRef}
              className="max-h-[60vh] overflow-y-auto"
            >
              {Object.keys(groupedCommands).length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <p>No commands found</p>
                  <p className="text-sm mt-2">Try a different search term</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                    <div key={category}>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-2">
                        {category}
                      </h4>
                      <div className="space-y-1">
                        {categoryCommands.map((command, index) => {
                          const flatIndex = flatCommands.indexOf(command)
                          const isSelected = flatIndex === selectedIndex
                          
                          return (
                            <button
                              key={command.id}
                              data-command-index={flatIndex}
                              onClick={() => executeCommand(command)}
                              onMouseEnter={() => setSelectedIndex(flatIndex)}
                              className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                                isSelected
                                  ? 'bg-blue-50 border-2 border-blue-500'
                                  : 'bg-white border-2 border-transparent hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">
                                    {highlightText(command.label, query)}
                                  </div>
                                  {command.description && (
                                    <div className="text-sm text-gray-500 mt-0.5">
                                      {command.description}
                                    </div>
                                  )}
                                </div>
                                {command.icon && (
                                  <div className="ml-4 text-gray-400">
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

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                    ↑↓
                  </kbd>
                  <span>Navigate</span>
                </div>
                <div className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                    Enter
                  </kbd>
                  <span>Select</span>
                </div>
                <div className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                    Esc
                  </kbd>
                  <span>Close</span>
                </div>
              </div>
              <div className="text-xs">
                {flatCommands.length} {flatCommands.length === 1 ? 'command' : 'commands'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

