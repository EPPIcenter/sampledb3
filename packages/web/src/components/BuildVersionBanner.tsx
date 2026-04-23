import { useCallback, useEffect, useState } from 'react'
import { getClientBuildId, fetchServerBuildId } from '@/lib/app-version'

const POLL_MS = 5 * 60 * 1000

/**
 * Compares the embedded build id to GET /api/app-version on load, on tab focus, and on an interval
 * so long-lived tabs learn when the server was redeployed.
 */
export function BuildVersionBanner() {
  const [outOfDate, setOutOfDate] = useState(false)
  const clientId = getClientBuildId()

  const check = useCallback(() => {
    if (import.meta.env.DEV) {
      return
    }
    const run = async () => {
      try {
        const serverId = await fetchServerBuildId()
        setOutOfDate(serverId !== clientId)
      } catch {
        // Network or parse errors — do not block the app or flash a false "update" banner
      }
    }
    void run()
  }, [clientId])

  useEffect(() => {
    if (import.meta.env.DEV) {
      return
    }
    check()
    const interval = window.setInterval(check, POLL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        check()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [check])

  useEffect(() => {
    if (!outOfDate) {
      document.body.style.paddingTop = ''
      return
    }
    document.body.style.paddingTop = '2.5rem'
    return () => {
      document.body.style.paddingTop = ''
    }
  }, [outOfDate])

  if (import.meta.env.DEV || !outOfDate) {
    return null
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[10020] flex items-center justify-center gap-3 border-b border-amber-700/30 bg-amber-100/95 px-3 py-2 text-sm text-amber-950 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/90 dark:text-amber-100"
      role="status"
    >
      <span>
        A new version of the app is available. Refresh the page to load it.
      </span>
      <button
        type="button"
        onClick={() => {
          window.location.reload()
        }}
        className="shrink-0 rounded border border-amber-800/50 bg-amber-200/80 px-2.5 py-0.5 font-medium text-amber-950 hover:bg-amber-300/90 dark:border-amber-300/40 dark:bg-amber-800/60 dark:text-amber-50 dark:hover:bg-amber-700/80"
      >
        Refresh now
      </button>
    </div>
  )
}
