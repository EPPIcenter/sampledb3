import type { User } from './api/auth'

const STORAGE_KEY = 'sampledb_recent_users'
const MAX_RECENT_USERS = 10

export interface LocalUser {
  id: number
  email: string
  name: string
  role: 'admin' | 'member' | 'viewer'
  lastLogin: string
}

/**
 * Get recent users from localStorage
 */
export function getRecentUsers(): LocalUser[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const users = JSON.parse(stored) as LocalUser[]
    // Sort by lastLogin (most recent first)
    return users.sort((a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime())
  } catch (error) {
    console.error('Failed to load recent users from localStorage:', error)
    throw error
  }
}

/**
 * Add or update a user in recent users list
 */
export function addRecentUser(user: User): void {
  try {
    const users = getRecentUsers()
    
    // Remove existing entry for this user if present
    const filtered = users.filter(u => u.id !== user.id)
    
    // Add current user at the beginning with current timestamp
    const updated: LocalUser[] = [
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        lastLogin: new Date().toISOString(),
      },
      ...filtered,
    ].slice(0, MAX_RECENT_USERS) // Keep only the most recent N users
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Failed to save recent user to localStorage:', error)
  }
}
