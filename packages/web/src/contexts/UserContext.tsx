import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react'
import { authApi, type User } from '../lib/api'
import { addRecentUser } from '../lib/localUserHistory'

// Run refresh once per app load; cache result for remounts (e.g. Strict Mode)
let userDidInit = false
let userCachedUser: User | null = null
let userCachedLoading = true
let userCachedError: string | null = null

interface UserContextType {
  user: User | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
  switchUser: (userId: number, password: string) => Promise<void>
  setUser: (user: User | null) => void
  canWrite: boolean
  canManageReferenceData: boolean
  isAdmin: boolean
  isMember: boolean
  isViewer: boolean
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setUser = useCallback((u: User | null) => {
    setUserState(u)
    userCachedUser = u
    userCachedLoading = false
    userCachedError = null
  }, [])

  const refreshUser = useCallback(async () => {
    setLoading(true)
    setError(null)
    userCachedLoading = true
    userCachedError = null
    try {
      const response = await authApi.getCurrentUser()
      const userData = response.data.user
      setUser(userData)
      if (userData) {
        addRecentUser(userData)
      }
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const axiosErr = err as { response?: { status?: number; data?: { error?: string } } }
        if (axiosErr.response?.status === 401) {
          setUser(null)
          setError(null)
        } else {
          const errMsg = axiosErr.response?.data?.error || 'Failed to load user'
          setError(errMsg)
          setUser(null)
          userCachedError = errMsg
        }
      } else {
        const errMsg = 'Failed to load user'
        setError(errMsg)
        setUser(null)
        userCachedError = errMsg
      }
    } finally {
      setLoading(false)
      userCachedLoading = false
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
        username: userData.username,
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
    } catch (err: unknown) {
      let errorMessage = 'Failed to switch user'
      if (typeof err === 'object' && err !== null) {
        if ('response' in err) {
          const axiosErr = err as { response?: { data?: { error?: string } } }
          errorMessage = axiosErr.response?.data?.error || errorMessage
        } else if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
          errorMessage = (err as { message: string }).message
        }
      }
      setError(errorMessage)
      setLoading(false)
      // Don't call refreshUser() here - if switch failed, we want to keep the current user
      // Calling refreshUser() could fail and log the user out even though they're still logged in
      throw new Error(errorMessage)
    }
  }, [])

  useEffect(() => {
    if (!userDidInit) {
      userDidInit = true
      void refreshUser()
    } else {
      setUser(userCachedUser)
      setLoading(userCachedLoading)
      setError(userCachedError)
    }
  }, [refreshUser])

  // Permission helpers
  const canWrite = useMemo(() => user?.role === 'admin' || user?.role === 'member', [user])
  const canManageReferenceData = useMemo(() => user?.role === 'admin', [user])
  const isAdmin = useMemo(() => user?.role === 'admin', [user])
  const isMember = useMemo(() => user?.role === 'member', [user])
  const isViewer = useMemo(() => user?.role === 'viewer', [user])

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({ 
      user, 
      loading, 
      error, 
      refreshUser, 
      switchUser, 
      setUser,
      canWrite,
      canManageReferenceData,
      isAdmin,
      isMember,
      isViewer,
    }),
    [user, loading, error, refreshUser, switchUser, setUser, canWrite, canManageReferenceData, isAdmin, isMember, isViewer]
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
