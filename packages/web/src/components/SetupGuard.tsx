import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PageError, getQueryErrorMessage } from '../ui'
import { useSetupStatus } from '../hooks/useAuthWorkflow'

export default function SetupGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const prevPathRef = useRef(location.pathname)
  const statusQuery = useSetupStatus()

  useEffect(() => {
    if (statusQuery.data?.initialized === false && location.pathname !== '/setup') {
      navigate('/setup', { replace: true })
    }
  }, [statusQuery.data?.initialized, location.pathname, navigate])

  // Re-check when leaving /setup (e.g. after initialize → /login).
  useEffect(() => {
    if (prevPathRef.current === '/setup' && location.pathname !== '/setup') {
      void statusQuery.refetch()
    }
    prevPathRef.current = location.pathname
  }, [location.pathname, statusQuery])

  const isChecking =
    statusQuery.isPending || (statusQuery.isFetching && statusQuery.isRefetching)

  if (isChecking && !statusQuery.isError) {
    return (
      <div className="min-h-screen bg-app-surface flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-app-accent mb-4" />
          <p className="text-app-text-muted">Checking setup status...</p>
        </div>
      </div>
    )
  }

  if (statusQuery.isError) {
    return (
      <div className="min-h-screen bg-app-surface flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <PageError
            title="Could not verify setup"
            message={getQueryErrorMessage(
              statusQuery.error,
              'Failed to check whether the system is initialized.',
            )}
            onRetry={() => void statusQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  if (statusQuery.data?.initialized === false && location.pathname !== '/setup') {
    return null
  }

  return <>{children}</>
}
