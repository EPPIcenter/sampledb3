import { describe, it, expect, beforeEach } from 'vitest'
import { cache, cacheKeys } from '../cache'

describe('cache', () => {
  beforeEach(() => {
    cache.clear()
  })

  it('returns null for missing key', () => {
    expect(cache.get('missing')).toBeNull()
  })

  it('set and get round-trip', () => {
    cache.set('k', { foo: 1 })
    expect(cache.get('k')).toEqual({ foo: 1 })
  })

  it('delete removes entry', () => {
    cache.set('k', 1)
    cache.delete('k')
    expect(cache.get('k')).toBeNull()
  })

  it('clear removes all', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.get('a')).toBeNull()
    expect(cache.get('b')).toBeNull()
  })

  it('getStats returns total and valid/expired', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    const stats = cache.getStats()
    expect(stats.total).toBe(2)
    expect(stats.valid).toBe(2)
    expect(stats.expired).toBe(0)
  })

  it('cacheKeys has expected keys', () => {
    expect(cacheKeys.specimenTypes).toBe('specimen-types')
    expect(cacheKeys.strains).toBe('strains')
  })
})
