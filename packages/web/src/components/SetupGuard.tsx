import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { setupApi } from '../lib/api'

// Run once per app load so Strict Mode double-mount doesn't run the check twice
let setupDidInit = false
let setupCachedInitialized: boolean | null = null
/** Shared promise so remounts before first completion can wait instead of defaulting. */
let setupPromise: Promise<void> | null = null

export default function SetupGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isChecking, setIsChecking] = useState(true)
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    if (!setupDidInit) {
      setupDidInit = true
      setupPromise = (async () => {
        try {
          if (isMountedRef.current) setIsChecking(true)
          const response = await setupApi.status()
          const initialized = response.data.initialized
          setupCachedInitialized = initialized
          if (isMountedRef.current) {
            setIsInitialized(initialized)
            if (!initialized && location.pathname !== '/setup') {
              navigate('/setup', { replace: true })
            }
          }
        } catch (error) {
          console.error('Failed to check setup status:', error)
          setupCachedInitialized = true
          if (isMountedRef.current) setIsInitialized(true)
        } finally {
          if (isMountedRef.current) setIsChecking(false)
        }
      })()
      void setupPromise
    } else if (setupCachedInitialized !== null) {
      // Already ran and we have a result (e.g. remount in Strict Mode after first completed)
      if (isMountedRef.current) {
        setIsInitialized(setupCachedInitialized)
        setIsChecking(false)
      }
    } else {
      // Remount before first run completed: stay in loading state and apply result when promise settles.
      // Only update state if this instance is still mounted when the promise completes.
      setupPromise?.finally(() => {
        if (isMountedRef.current) {
          setIsInitialized(setupCachedInitialized ?? true)
          setIsChecking(false)
        }
      })
    }
    return () => {
      isMountedRef.current = false
    }
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

