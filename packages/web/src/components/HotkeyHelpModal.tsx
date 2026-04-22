import { useHotkeyContext } from '../contexts/HotkeyContext'
import { HOTKEY_DEFINITIONS, formatHotkey } from '../lib/hotkeys'
import { useHotkey } from '../hooks/useHotkey'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import ModalPortal from './ModalPortal'

interface HotkeyHelpModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function HotkeyHelpModal({ isOpen, onClose }: HotkeyHelpModalProps) {
  // Close on Escape
  useHotkey('escape', () => {
    if (isOpen) {
      onClose()
    }
  }, { enabled: isOpen })

  useBodyScrollLock(isOpen)

  if (!isOpen) return null

  // Group hotkeys by category
  const groupedHotkeys = HOTKEY_DEFINITIONS.reduce((acc, hotkey) => {
    (acc[hotkey.category] ??= []).push(hotkey)
    return acc
  }, {} as Record<string, typeof HOTKEY_DEFINITIONS>)

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          {/* Background overlay */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-md"
            onClick={onClose}
          />

        {/* Modal panel */}
        <div className="relative z-10 inline-block align-bottom bg-app-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full border border-app-border">
          <div className="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-app-text">Keyboard Shortcuts</h3>
              <button
                onClick={onClose}
                className="text-app-text-muted hover:text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent rounded"
                aria-label="Close"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 max-h-[60vh] overflow-y-auto">
              {Object.entries(groupedHotkeys).map(([category, hotkeys]) => (
                <div key={category}>
                  <h4 className="text-sm font-semibold text-app-text-muted uppercase tracking-wide mb-3">
                    {category}
                  </h4>
                  <div className="space-y-2">
                    {hotkeys.map((hotkey, index) => (
                      <div
                        key={`${hotkey.keys}-${index}`}
                        className="flex items-start justify-between py-2 border-b border-app-border last:border-b-0"
                      >
                        <div className="flex-1">
                          <div className="text-sm text-app-text">{hotkey.description}</div>
                          {hotkey.context && (
                            <div className="text-xs text-app-text-muted mt-0.5">{hotkey.context}</div>
                          )}
                        </div>
                        <div className="ml-4">
                          <kbd className="px-2 py-1 text-xs font-semibold text-app-text bg-app-surface border border-app-border rounded shadow-sm">
                            {formatHotkey(hotkey.keys)}
                          </kbd>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-app-border space-y-2">
              <p className="text-sm text-app-text-muted">
                Press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-app-text bg-app-surface border border-app-border rounded">Esc</kbd> to close
              </p>
              <a
                href="/docs"
                className="text-sm text-app-accent hover:text-app-accent-hover hover:underline"
              >
                View full documentation →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

