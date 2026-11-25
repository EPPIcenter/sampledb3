import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PageError, getQueryErrorMessage } from '../ui'
import { useSetupStatus } from '../hooks/useAuthWorkflow'

export default function SetupGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [prevPathname, setPrevPathname] = useState(location.pathname)
  const [recheckingAfterSetup, setRecheckingAfterSetup] = useState(false)
  const statusQuery = useSetupStatus()
  const { refetch } = statusQuery

  if (prevPathname !== location.pathname) {
    const leavingSetup = prevPathname === '/setup' && location.pathname !== '/setup'
    setPrevPathname(location.pathname)
    if (leavingSetup) {
      setRecheckingAfterSetup(true)
    } else if (location.pathname === '/setup' && recheckingAfterSetup) {
      setRecheckingAfterSetup(false)
    }
  }

  // Re-check when leaving /setup (e.g. after initialize → /login) and hold the app until it answers.
  useEffect(() => {
    if (!recheckingAfterSetup) return
    let cancelled = false
    void refetch().finally(() => {
      if (!cancelled) setRecheckingAfterSetup(false)
    })
    return () => {
      cancelled = true
    }
  }, [recheckingAfterSetup, refetch])

  useEffect(() => {
    if (
      !recheckingAfterSetup &&
      statusQuery.data?.initialized === false &&
      location.pathname !== '/setup'
    ) {
      navigate('/setup', { replace: true })
    }
  }, [recheckingAfterSetup, statusQuery.data?.initialized, location.pathname, navigate])

  // Block only before the initial status has loaded or during the deliberate post-/setup re-check.
  // Background refetches (e.g. from invalidateAfterBulkWrite) must not unmount the app.
  if (recheckingAfterSetup || statusQuery.isPending) {
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

  if (statusQuery.data.initialized === false && location.pathname !== '/setup') {
    return null
  }

  return <>{children}</>
}
