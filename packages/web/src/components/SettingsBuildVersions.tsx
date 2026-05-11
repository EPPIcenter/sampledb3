import { useEffect, useState } from 'react'
import { fetchServerBuildId, getClientBuildId } from '@/lib/app-version'

/**
 * Read-only Web vs API build identifiers for Settings → About (deployment / support).
 */
export function SettingsBuildVersions() {
  const clientId = getClientBuildId()
  const [serverId, setServerId] = useState<string | null>(null)
  const [serverState, setServerState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const id = await fetchServerBuildId()
        if (!cancelled) {
          setServerId(id)
          setServerState('ok')
        }
      } catch {
        if (!cancelled) {
          setServerState('error')
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const serverDisplay =
    serverState === 'loading' ? '…' : serverState === 'error' ? 'unavailable' : (serverId ?? 'unavailable')

  const rowClass = 'grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm max-w-xl'
  const dtClass = 'text-app-text-muted shrink-0 pt-0.5'
  const ddClass = 'font-mono text-xs break-all text-app-text tabular-nums'

  return (
    <dl className="space-y-4" aria-label="Application build identifiers">
      <div className={rowClass}>
        <dt className={dtClass}>Web build</dt>
        <dd className={ddClass} title={clientId}>
          {clientId}
        </dd>
      </div>
      <div className={rowClass}>
        <dt className={dtClass}>API build</dt>
        <dd className={ddClass} title={serverState === 'ok' ? (serverId ?? '') : undefined}>
          {serverDisplay}
        </dd>
      </div>
    </dl>
  )
}
