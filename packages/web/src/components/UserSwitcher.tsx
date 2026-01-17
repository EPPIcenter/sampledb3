import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { getRecentUsers, type LocalUser } from '../lib/localUserHistory'
import { authApi } from '../lib/api'

export default function UserSwitcher() {
  const { user, switchUser, refreshUser } = useUser()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [users, setUsers] = useState<LocalUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [password, setPassword] = useState('')
  const [switching, setSwitching] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Reload users when user changes (e.g., after switching)
  useEffect(() => {
    loadUsers()
  }, [user?.id])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      loadUsers()
      
      // Calculate if dropdown should open upward
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top
        const dropdownHeight = 384 // max-h-96 = 24rem = 384px (approximate)
        
        // If there's not enough space below but enough space above, open upward
        setOpenUpward(spaceBelow < dropdownHeight && spaceAbove > spaceBelow)
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const loadUsers = () => {
    try {
      setError(null)
      // Load from localStorage instead of API
      const recentUsers = getRecentUsers()
      setUsers(recentUsers)
    } catch (err: any) {
      setError('Failed to load recent users')
    }
  }

  const handleUserSelect = (userId: number) => {
    if (userId === user?.id) {
      setIsOpen(false)
      return
    }
    setSelectedUserId(userId)
    setShowPasswordDialog(true)
    setPassword('')
  }

  const handleSwitch = async () => {
    if (!selectedUserId || !password) return

    try {
      setSwitching(true)
      setError(null)
      // switchUser from context handles saving to localStorage and updating user state
      await switchUser(selectedUserId, password)
      // Small delay to ensure state propagation
      await new Promise(resolve => setTimeout(resolve, 50))
      // Reload users list to update the recent users
      loadUsers()
      setShowPasswordDialog(false)
      setIsOpen(false)
      setPassword('')
      setSelectedUserId(null)
    } catch (err: any) {
      setError(err.message || 'Failed to switch user')
    } finally {
      setSwitching(false)
    }
  }

  const selectedUser = users.find(u => u.id === selectedUserId)

  if (!user) {
    return null
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="group flex items-center gap-2 px-3 py-2.5 bg-white text-gray-700 rounded-lg shadow-md hover:shadow-lg border border-gray-200 hover:border-blue-300 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
          title={`Current user: ${user.name}`}
        >
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col items-start min-w-0">
            <div className="text-xs font-medium text-gray-700 group-hover:text-blue-600 transition-colors truncate max-w-[120px]">
              {user.name}
            </div>
            <div className="text-[10px] text-gray-500 truncate max-w-[120px]">
              {user.email}
            </div>
          </div>
          <svg
            className={`w-4 h-4 transition-transform flex-shrink-0 text-gray-500 group-hover:text-blue-600 ${isOpen && !openUpward ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className={`absolute right-0 w-64 sm:w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto max-w-[calc(100vw-3rem)] ${
            openUpward 
              ? 'bottom-full mb-2' 
              : 'top-full mt-2'
          }`}>
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Switch User</div>
              <div className="px-3 py-1 text-xs text-gray-400">Recent users on this machine</div>
              {error && (
                <div className="px-3 py-2 text-sm text-red-600">{error}</div>
              )}
              {users.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No recent users found</div>
              ) : (
                <div className="space-y-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleUserSelect(u.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        u.id === user.id
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </button>
                  ))}
                </div>
              )}
              
              {/* Logout separator */}
              <div className="border-t border-gray-200 my-2"></div>
              
              {/* Logout button */}
              <button
                onClick={async () => {
                  try {
                    setLoggingOut(true)
                    await authApi.logout()
                    await refreshUser()
                    navigate('/login')
                  } catch (err) {
                    console.error('Logout failed:', err)
                    setError('Failed to logout')
                    setLoggingOut(false)
                  }
                }}
                disabled={loggingOut}
                className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-red-50 text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="font-medium">{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {showPasswordDialog && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Switch User</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter password for <strong>{selectedUser.name}</strong> ({selectedUser.email}) to switch accounts.
            </p>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password) {
                    handleSwitch()
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowPasswordDialog(false)
                  setPassword('')
                  setSelectedUserId(null)
                  setError(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={switching}
              >
                Cancel
              </button>
              <button
                onClick={handleSwitch}
                disabled={!password || switching}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {switching ? 'Switching...' : 'Switch User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
