import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getRecentUsers, addRecentUser } from '../localUserHistory'

const STORAGE_KEY = 'sampledb_recent_users'

describe('localUserHistory', () => {
  let storage: Record<string, string>

  beforeEach(() => {
    storage = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value
      },
      removeItem: (key: string) => {
        delete storage[key]
      },
      clear: () => {
        storage = {}
      },
      length: 0,
      key: () => null,
    })
  })

  it('getRecentUsers returns empty when no storage', () => {
    expect(getRecentUsers()).toEqual([])
  })

  it('getRecentUsers returns parsed and sorted users', () => {
    const users = [
      { id: 1, email: 'a@x.com', name: 'A', role: 'member' as const, lastLogin: '2024-01-01T00:00:00Z' },
      { id: 2, email: 'b@x.com', name: 'B', role: 'member' as const, lastLogin: '2024-01-02T00:00:00Z' },
    ]
    storage[STORAGE_KEY] = JSON.stringify(users)
    const result = getRecentUsers()
    expect(result).toHaveLength(2)
    expect(result[0].lastLogin >= result[1].lastLogin).toBe(true)
  })

  it('addRecentUser stores user and getRecentUsers returns it', () => {
    addRecentUser({
      id: 1,
      email: 'u@x.com',
      name: 'User',
      role: 'member',
    })
    const recent = getRecentUsers()
    expect(recent).toHaveLength(1)
    expect(recent[0].email).toBe('u@x.com')
  })
})
