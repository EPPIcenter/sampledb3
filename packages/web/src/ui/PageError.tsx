import { Button } from './Button'

export interface PageErrorProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function PageError({
  title = 'Something went wrong',
  message,
  onRetry,
}: PageErrorProps) {
  return (
    <div
      role="alert"
      className="dashboard-card rounded-xl px-6 py-12 text-center"
    >
      <p className="text-lg font-medium text-app-text">{title}</p>
      <p className="mt-2 text-sm text-app-text-muted">{message}</p>
      {onRetry && (
        <div className="mt-6">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
