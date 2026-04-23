const CLIENT_BUILD_ID = import.meta.env.VITE_APP_BUILD_ID

export function getClientBuildId(): string {
  return CLIENT_BUILD_ID
}

export async function fetchServerBuildId(): Promise<string> {
  const r = await fetch('/api/app-version', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!r.ok) {
    throw new Error(`app-version: HTTP ${r.status}`)
  }
  const data = (await r.json()) as { buildId?: string }
  if (typeof data.buildId !== 'string' || data.buildId.length === 0) {
    throw new Error('app-version: missing buildId')
  }
  return data.buildId
}
