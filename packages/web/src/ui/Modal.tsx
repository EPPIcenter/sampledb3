import { useEffect, useId, type ReactNode } from 'react'
import ModalPortal from '../components/ModalPortal'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-lg',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
  xl: 'sm:max-w-3xl',
}

const defaultContentPadding = 'bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  /** Shown in the header row; omit when the body supplies its own title. */
  title?: ReactNode
  titleClassName?: string
  footer?: ReactNode
  size?: ModalSize
  /** When false, backdrop click and Escape do not call onClose. */
  closeDisabled?: boolean
  showCloseButton?: boolean
  panelClassName?: string
  contentClassName?: string
  overlayClassName?: string
}

export function Modal({
  isOpen,
  onClose,
  children,
  title,
  titleClassName = 'text-lg font-semibold text-app-text',
  footer,
  size = 'md',
  closeDisabled = false,
  showCloseButton = true,
  panelClassName = '',
  contentClassName = defaultContentPadding,
  overlayClassName = '',
}: ModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!isOpen || closeDisabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closeDisabled, onClose])

  if (!isOpen) return null

  const handleBackdrop = () => {
    if (!closeDisabled) onClose()
  }

  const showHeader = title != null || (showCloseButton && !closeDisabled)

  return (
    <ModalPortal>
      <div
        className={`fixed inset-0 z-[100] overflow-y-auto ${overlayClassName}`.trim()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !closeDisabled) {
            e.preventDefault()
            onClose()
          }
        }}
      >
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-md"
            onClick={handleBackdrop}
            aria-hidden
          />
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
            &#8203;
          </span>
          <div
            className={`relative z-10 inline-block align-bottom bg-app-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:w-full ${sizeClasses[size]} ${panelClassName}`.trim()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title != null ? titleId : undefined}
          >
            <div className={contentClassName}>
              {showHeader && (
                <div className="flex items-center justify-between mb-4">
                  {title != null ? (
                    <h2 id={titleId} className={titleClassName}>
                      {title}
                    </h2>
                  ) : (
                    <span />
                  )}
                  {showCloseButton && (
                    <button
                      type="button"
                      className="text-app-text-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent rounded disabled:opacity-50"
                      onClick={() => !closeDisabled && onClose()}
                      aria-label="Close"
                      disabled={closeDisabled}
                    >
                      &#215;
                    </button>
                  )}
                </div>
              )}
              {children}
              {footer != null ? (
                <div className="flex justify-end gap-3 mt-4">{footer}</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
