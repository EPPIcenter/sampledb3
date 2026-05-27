import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { setupApi } from '../lib/api/settings';// Run once per app load so Strict Mode double-mount doesn't run the check twice
let setupDidInit = false
let setupCachedInitialized: boolean | null = null
/** Shared promise so remounts before first completion can wait instead of defaulting. */
let setupPromise: Promise<void> | null = null

export default function SetupGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const prevPathRef = useRef(location.pathname)
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
          const initialized = response.initialized
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref may be null before mount
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
     
  }, [])

  // Re-check setup status when navigating away from /setup (e.g. after completing setup → /login).
  // Otherwise setupCachedInitialized stays false and we'd render null for /login, causing a white page.
  useEffect(() => {
    if (prevPathRef.current === '/setup' && location.pathname !== '/setup') {
      prevPathRef.current = location.pathname
      setupPromise = (async () => {
        try {
          if (isMountedRef.current) setIsChecking(true)
          const response = await setupApi.status()
          setupCachedInitialized = response.initialized
          if (isMountedRef.current) {
            setIsInitialized(setupCachedInitialized)
          }
        } catch (error) {
          console.error('Failed to re-check setup status:', error)
          setupCachedInitialized = true
          if (isMountedRef.current) setIsInitialized(true)
        } finally {
          if (isMountedRef.current) setIsChecking(false)
        }
      })()
      void setupPromise
    } else {
      prevPathRef.current = location.pathname
    }
  }, [location.pathname])

  // Show loading state while checking
  if (isChecking) {
    return (
      <div className="min-h-screen bg-app-surface flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-app-accent mb-4"></div>
          <p className="text-app-text-muted">Checking setup status...</p>
        </div>
      </div>
    )
  }

  // If not initialized and not on /setup, don't render children (redirect will happen).
  // When navigating from /setup to /login after completion, we re-fetch status so isInitialized becomes true.
  if (!isInitialized && location.pathname !== '/setup') {
    return null
  }

  // Otherwise, render children normally
  return <>{children}</>
}

