import { HOTKEY_DEFINITIONS, formatHotkey } from '../lib/hotkeys'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { Modal } from '../ui'

interface HotkeyHelpModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function HotkeyHelpModal({ isOpen, onClose }: HotkeyHelpModalProps) {
  useBodyScrollLock(isOpen)

  const groupedHotkeys = HOTKEY_DEFINITIONS.reduce(
    (acc, hotkey) => {
      (acc[hotkey.category] ??= []).push(hotkey)
      return acc
    },
    {} as Record<string, typeof HOTKEY_DEFINITIONS>,
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Keyboard Shortcuts"
      titleClassName="text-2xl font-bold text-app-text"
      size="lg"
      contentClassName="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4"
      panelClassName="border border-app-border"
    >
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
          Press{' '}
          <kbd className="px-1.5 py-0.5 text-xs font-semibold text-app-text bg-app-surface border border-app-border rounded">
            Esc
          </kbd>{' '}
          to close
        </p>
        <a
          href="/docs"
          className="text-sm text-app-accent hover:text-app-accent-hover hover:underline"
        >
          View full documentation →
        </a>
      </div>
    </Modal>
  )
}
