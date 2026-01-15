import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react'
import { authApi, type User } from '../lib/api'
import { addRecentUser } from '../lib/localUserHistory'

interface UserContextType {
  user: User | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
  switchUser: (userId: number, password: string) => Promise<void>
  setUser: (user: User | null) => void
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshUser = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await authApi.getCurrentUser()
      const userData = response.data.user
      setUser(userData)
      // Save to local user history when user is refreshed
      if (userData) {
        addRecentUser(userData)
      }
    } catch (err: any) {
      // If 401, user is not authenticated - this is expected, not an error
      if (err.response?.status === 401) {
        setUser(null)
        setError(null)
      } else {
        setError(err.response?.data?.error || 'Failed to load user')
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const switchUser = useCallback(async (userId: number, password: string) => {
    try {
      setLoading(true)
      setError(null)
      const response = await authApi.switchUser(userId, password)
      // The response structure is: { data: { user: {...} } }
      const userData = response.data?.user
      if (!userData) {
        throw new Error('Invalid response from server')
      }
      // Create a completely new object to ensure React detects the change
      const newUser: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
      }
      // Save to local user history when switching users
      addRecentUser(newUser)
      // Update user state immediately - this should trigger UI re-render
      // The switch endpoint already sets the new session cookie, so we trust the response
      setUser(newUser)
      // Clear loading state - React will batch these updates but both will apply
      setLoading(false)
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to switch user'
      setError(errorMessage)
      setLoading(false)
      // Don't call refreshUser() here - if switch failed, we want to keep the current user
      // Calling refreshUser() could fail and log the user out even though they're still logged in
      throw new Error(errorMessage)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({ user, loading, error, refreshUser, switchUser, setUser }),
    [user, loading, error, refreshUser, switchUser, setUser]
  )

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
