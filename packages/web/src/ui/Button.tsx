import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-app-accent text-white hover:bg-app-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent',
  secondary:
    'border border-app-border text-app-text bg-app-card hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent',
  ghost:
    'text-app-text-muted hover:text-app-text hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent',
  danger:
    'bg-app-trend-down text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-trend-down',
}

export function buttonClassName(
  variant: ButtonVariant = 'primary',
  options?: { loading?: boolean; className?: string }
): string {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const loading = options?.loading ? 'opacity-70' : ''
  return [base, variantClasses[variant], loading, options?.className].filter(Boolean).join(' ')
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={buttonClassName(variant, { loading, className })}
      {...rest}
    >
      {loading ? (
        <>
          <SpinnerIcon />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  )
}

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
