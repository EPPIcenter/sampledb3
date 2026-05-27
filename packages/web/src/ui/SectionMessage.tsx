export interface SectionMessageProps {
  message: string
  variant?: 'loading' | 'error'
}

/** Muted inline status for tab sections (summary, timeline). */
export function SectionMessage({ message, variant = 'loading' }: SectionMessageProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className="py-8 text-center text-sm text-app-text-muted"
    >
      {message}
    </div>
  )
}
