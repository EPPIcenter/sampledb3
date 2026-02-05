import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="user-switcher__trigger flex items-center gap-2 min-w-0"
          title={`Current user: ${user.name}`}
        >
          <div className="user-switcher__avatar w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col items-start min-w-0 flex-1">
            <div className="text-xs font-medium truncate max-w-[120px]">
              {user.name}
            </div>
            <div className="text-[10px] truncate max-w-[120px] opacity-80">
              {user.email}
            </div>
          </div>
          <svg
            className={`user-switcher__chevron w-4 h-4 flex-shrink-0 ${isOpen && !openUpward ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div
            className={`user-switcher__dropdown absolute right-0 w-64 sm:w-72 z-50 max-h-96 overflow-y-auto max-w-[calc(100vw-3rem)] p-2 ${
              openUpward ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            <div className="user-switcher__section-title px-3 py-2">Switch User</div>
            <div className="px-3 py-1 text-xs opacity-80">Recent users on this machine</div>
            {error && (
              <div className="palette-dialog-error mx-2 mt-2">{error}</div>
            )}
            {users.length === 0 ? (
              <div className="px-3 py-2 text-sm opacity-80">No recent users found</div>
            ) : (
              <div className="space-y-1 mt-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleUserSelect(u.id)}
                    className={`user-switcher__item w-full text-left px-3 py-2 rounded-md text-sm border-l-2 border-transparent ${
                      u.id === user.id ? 'user-switcher__item--current' : ''
                    }`}
                  >
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs opacity-80">{u.email}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="border-t my-2" style={{ borderColor: 'rgb(var(--palette-border))' }} />

            <button
              type="button"
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
              className="user-switcher__logout w-full text-left px-3 py-2 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="font-medium">{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
            </button>
          </div>
        )}
      </div>

      {showPasswordDialog &&
        selectedUser &&
        createPortal(
          <div className="palette-dialog-overlay">
            <div
              className="palette-dialog-panel"
              role="dialog"
              aria-labelledby="switch-user-dialog-title"
              aria-modal="true"
            >
              <h3 id="switch-user-dialog-title">Switch User</h3>
              <p className="text-sm mb-4 opacity-80">
                Enter password for <strong>{selectedUser.name}</strong> ({selectedUser.email}) to switch accounts.
              </p>
              {error && (
                <div className="palette-dialog-error mb-4">{error}</div>
              )}
              <div className="mb-4">
                <label htmlFor="user-switcher-password" className="block mb-2">
                  Password
                </label>
                <input
                  id="user-switcher-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && password) {
                      handleSwitch()
                    }
                  }}
                  className="palette-dialog-input"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordDialog(false)
                    setPassword('')
                    setSelectedUserId(null)
                    setError(null)
                  }}
                  className="palette-dialog-btn-secondary"
                  disabled={switching}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSwitch}
                  disabled={!password || switching}
                  className="palette-dialog-btn-primary"
                >
                  {switching ? 'Switching...' : 'Switch User'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
