import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchServerBuildId, getClientBuildId } from '../app-version'

describe('getClientBuildId', () => {
  it('returns a non-empty string (from Vite test define)', () => {
    const id = getClientBuildId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})

describe('fetchServerBuildId', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns buildId from JSON on success', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ buildId: 'from-server' }),
      } as unknown as Response)
    ) as unknown as typeof fetch
    await expect(fetchServerBuildId()).resolves.toBe('from-server')
  })

  it('throws on non-OK response', async () => {
    globalThis.fetch = vi.fn(
      () => Promise.resolve({ ok: false, status: 503 } as Response)
    ) as unknown as typeof fetch
    await expect(fetchServerBuildId()).rejects.toThrow('503')
  })

  it('throws on missing buildId in JSON', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as unknown as Response)
    ) as unknown as typeof fetch
    await expect(fetchServerBuildId()).rejects.toThrow('missing buildId')
  })
})
