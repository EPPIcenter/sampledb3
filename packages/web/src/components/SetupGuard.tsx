import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { setupApi } from '../lib/api'

export default function SetupGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isChecking, setIsChecking] = useState(true)
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null)
  const hasCheckedRef = useRef(false)

  // Check setup status on mount and redirect if not initialized (single Effect)
  useEffect(() => {
    if (hasCheckedRef.current) return
    hasCheckedRef.current = true

    const checkSetupStatus = async () => {
      try {
        setIsChecking(true)
        const response = await setupApi.status()
        const initialized = response.data.initialized
        setIsInitialized(initialized)

        if (!initialized && location.pathname !== '/setup') {
          navigate('/setup', { replace: true })
        }
      } catch (error) {
        console.error('Failed to check setup status:', error)
        setIsInitialized(true)
      } finally {
        setIsChecking(false)
      }
    }

    checkSetupStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show loading state while checking
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Checking setup status...</p>
        </div>
      </div>
    )
  }

  // If not initialized and not on /setup, don't render children (redirect will happen)
  if (!isInitialized && location.pathname !== '/setup') {
    return null
  }

  // Otherwise, render children normally
  return <>{children}</>
}

