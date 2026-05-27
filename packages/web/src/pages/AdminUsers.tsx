import { useEffect, useRef, useState, useMemo } from 'react'
import { adminApi } from '../lib/api/admin';
import type { User, UserSession } from '../lib/api/auth';
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import ModalPortal from '../components/ModalPortal'
import '../styles/admin.css'

interface CreateUserData {
  email: string
  name: string
  password: string
  role: 'admin' | 'member' | 'viewer'
}

interface EditUserData {
  name?: string
  email?: string
  role?: 'admin' | 'member' | 'viewer'
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showSessionsModal, setShowSessionsModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [sessions, setSessions] = useState<UserSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  useFocusSearchOnSlash(searchInputRef)

  // Form states
  const [createForm, setCreateForm] = useState<CreateUserData>({
    email: '',
    name: '',
    password: '',
    role: 'member',
  })
  const [editForm, setEditForm] = useState<EditUserData>({})
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [showDeleted])

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const query = searchQuery.toLowerCase()
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query)
    )
  }, [users, searchQuery])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await adminApi.getUsers(showDeleted)
      setUsers(response.data.users)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message || 'Failed to load users')
      console.error('Error loading users:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      if (!createForm.email || !createForm.name || !createForm.password) {
        setError('All fields are required')
        return
      }

      if (createForm.password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }

      await adminApi.createUser(createForm)
      setShowCreateModal(false)
      setCreateForm({ email: '', name: '', password: '', role: 'member' })
      await loadUsers()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message || 'Failed to create user')
    }
  }

  const handleEdit = async () => {
    if (!selectedUser) return

    try {
      await adminApi.updateUser(selectedUser.id, editForm)
      setShowEditModal(false)
      setSelectedUser(null)
      setEditForm({})
      await loadUsers()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message || 'Failed to update user')
    }
  }

  const handleDelete = async () => {
    if (!selectedUser) return

    try {
      await adminApi.deleteUser(selectedUser.id)
      setShowDeleteModal(false)
      setSelectedUser(null)
      await loadUsers()
    } catch (err: unknown) {
      const res = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; details?: string } } }).response?.data
        : null
      setError(res?.error || res?.details || 'Failed to delete user')
    }
  }

  const handleApprove = async (user: User) => {
    try {
      await adminApi.approveUser(user.id)
      await loadUsers()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message || 'Failed to approve user')
    }
  }

  const handleRestore = async (user: User) => {
    try {
      await adminApi.restoreUser(user.id)
      await loadUsers()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message || 'Failed to restore user')
    }
  }

  const handleResetPassword = async () => {
    if (!selectedUser) return

    try {
      if (!passwordForm.password || passwordForm.password !== passwordForm.confirmPassword) {
        setError('Passwords do not match')
        return
      }

      if (passwordForm.password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }

      await adminApi.resetPassword(selectedUser.id, passwordForm.password)
      setShowPasswordModal(false)
      setSelectedUser(null)
      setPasswordForm({ password: '', confirmPassword: '' })
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message || 'Failed to reset password')
    }
  }

  const loadSessions = async (userId: number) => {
    try {
      setSessionsLoading(true)
      const response = await adminApi.getUserSessions(userId)
      setSessions(response.data.sessions)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message || 'Failed to load sessions')
    } finally {
      setSessionsLoading(false)
    }
  }

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await adminApi.revokeSession(sessionId)
      if (selectedUser) {
        await loadSessions(selectedUser.id)
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message || 'Failed to revoke session')
    }
  }

  const openEditModal = (user: User) => {
    setSelectedUser(user)
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (user: User) => {
    setSelectedUser(user)
    setShowDeleteModal(true)
  }

  const openPasswordModal = (user: User) => {
    setSelectedUser(user)
    setPasswordForm({ password: '', confirmPassword: '' })
    setShowPasswordModal(true)
  }

  const openSessionsModal = async (user: User) => {
    setSelectedUser(user)
    setShowSessionsModal(true)
    await loadSessions(user.id)
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="relative z-10 p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6" style={{ color: 'rgb(var(--app-text))' }}>User Management</h1>
            <div className="admin-card p-6">
              <div className="animate-pulse space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 admin-skeleton rounded" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="relative z-10 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">User Management</h1>
              <p className="text-[rgb(var(--app-text-muted))] mt-1">Manage users, roles, and permissions</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="admin-btn-primary px-4 py-2 flex items-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add User
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-app-trend-down/10 border border-app-trend-down rounded-lg p-4">
              <div className="flex items-center justify-between">
                <p className="text-app-trend-down">{error}</p>
                <button onClick={() => setError(null)} className="text-app-trend-down hover:text-app-trend-down">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="admin-card p-4 mb-6 flex items-center gap-4">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="rounded border-[rgb(var(--app-border))]"
              />
              <span className="text-sm text-[rgb(var(--app-text))]">Show deleted users</span>
            </label>
          </div>

          {/* Users Table */}
          <div className="admin-card overflow-hidden">
            <table className="admin-table min-w-full">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-app-text-muted uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className={user.deletedAt ? 'bg-app-surface opacity-60' : ''}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm font-medium dashboard-stat-value">{user.name}</div>
                      {user.deletedAt && (
                        <span className="ml-2 px-2 py-1 text-xs bg-app-trend-down/10 text-app-trend-down rounded">
                          Deleted
                        </span>
                      )}
                      {!user.deletedAt && !user.approvedAt && (
                        <span className="ml-2 px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded">
                          Pending
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm dashboard-stat-muted">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : user.role === 'member'
                          ? 'bg-app-accent-muted text-app-accent-hover'
                          : 'bg-app-surface text-app-text'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.approvedAt ? (
                      <span className="text-sm text-app-trend-up">Approved</span>
                    ) : (
                      <span className="text-sm text-amber-600">Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm dashboard-stat-muted">
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString()
                      : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm dashboard-stat-muted">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {user.deletedAt ? (
                        <button
                          onClick={() => handleRestore(user)}
                          className="text-app-trend-up hover:text-app-text flex items-center gap-1"
                          title="Restore user"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      ) : (
                        <>
                          {!user.approvedAt && (
                            <button
                              onClick={() => handleApprove(user)}
                              className="text-app-trend-up hover:text-app-text"
                              title="Approve user"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => openSessionsModal(user)}
                            className="text-app-accent hover:text-app-accent-hover"
                            title="View sessions"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openEditModal(user)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Edit user"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openPasswordModal(user)}
                            className="text-yellow-600 hover:text-yellow-900"
                            title="Reset password"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openDeleteModal(user)}
                            className="text-app-trend-down hover:text-app-trend-down"
                            title="Delete user"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-[rgb(var(--app-text-muted))]">
              {showDeleted ? 'No deleted users found' : 'No users found'}
            </div>
          )}
        </div>

        {/* Create User Modal */}
        {showCreateModal && (
          <ModalPortal>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm admin-modal-overlay flex items-center justify-center z-50">
            <div className="admin-card p-6 max-w-md w-full mx-4 border border-[rgb(var(--app-border))]">
              <h2 className="text-xl font-bold mb-4">Create New User</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      className="w-full px-3 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-app-text-muted hover:text-app-text-muted"
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.59-3.59l3.29 3.29M12 12l.879.879m-6.562-6.562l3.29 3.29M21 21l-3.29-3.29m0 0L15.12 14.12m3.59 3.59l-3.29-3.29M12 12l-.879-.879m6.562 6.562l-3.29-3.29" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-app-text mb-1">
                    Role
                  </label>
                  <select
                    value={createForm.role}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        role: e.target.value as 'admin' | 'member' | 'viewer',
                      })
                    }
                    className="w-full px-3 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleCreate} className="flex-1 admin-btn-primary px-4 py-2">
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setCreateForm({ email: '', name: '', password: '', role: 'member' })
                  }}
                  className="flex-1 admin-btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        )}

        {/* Edit User Modal */}
        {showEditModal && selectedUser && (
          <ModalPortal>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm admin-modal-overlay flex items-center justify-center z-50">
            <div className="admin-card p-6 max-w-md w-full mx-4 border border-[rgb(var(--app-border))]">
              <h2 className="text-xl font-bold mb-4">Edit User</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email || ''}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
                    Role
                  </label>
                  <select
                    value={editForm.role || 'member'}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        role: e.target.value as 'admin' | 'member' | 'viewer',
                      })
                    }
                    className="w-full px-3 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleEdit} className="flex-1 admin-btn-primary px-4 py-2">
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowEditModal(false)
                    setSelectedUser(null)
                    setEditForm({})
                  }}
                  className="flex-1 admin-btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedUser && (
          <ModalPortal>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm admin-modal-overlay flex items-center justify-center z-50">
            <div className="admin-card p-6 max-w-md w-full mx-4 border border-[rgb(var(--app-border))]">
              <h2 className="text-xl font-bold mb-4">Delete User</h2>
              <p className="text-[rgb(var(--app-text-muted))] mb-4">
                Are you sure you want to soft delete <strong>{selectedUser.name}</strong>? This
                action can be undone by restoring the user.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-app-trend-down text-white rounded-lg hover:opacity-90"
                >
                  Delete
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setSelectedUser(null)
                  }}
                  className="flex-1 admin-btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        )}

        {/* Password Reset Modal */}
        {showPasswordModal && selectedUser && (
          <ModalPortal>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm admin-modal-overlay flex items-center justify-center z-50">
            <div className="admin-card p-6 max-w-md w-full mx-4 border border-[rgb(var(--app-border))]">
              <h2 className="text-xl font-bold mb-4">Reset Password</h2>
              <p className="text-[rgb(var(--app-text-muted))] mb-4">Reset password for {selectedUser.name}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordForm.password}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, password: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-app-text-muted hover:text-app-text-muted"
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.59-3.59l3.29 3.29M12 12l.879.879m-6.562-6.562l3.29 3.29M21 21l-3.29-3.29m0 0L15.12 14.12m3.59 3.59l-3.29-3.29M12 12l-.879-.879m6.562 6.562l-3.29-3.29" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-app-text mb-1">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[rgb(var(--app-border))] rounded-lg form-input"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleResetPassword} className="flex-1 admin-btn-primary px-4 py-2">
                  Reset Password
                </button>
                <button
                  onClick={() => {
                    setShowPasswordModal(false)
                    setSelectedUser(null)
                    setPasswordForm({ password: '', confirmPassword: '' })
                  }}
                  className="flex-1 admin-btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        )}

        {/* Sessions Modal */}
        {showSessionsModal && selectedUser && (
          <ModalPortal>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm admin-modal-overlay flex items-center justify-center z-50">
            <div className="admin-card p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto border border-[rgb(var(--app-border))]">
              <h2 className="text-xl font-bold mb-4">Active Sessions for {selectedUser.name}</h2>
              {sessionsLoading ? (
                <div className="text-center py-8 dashboard-stat-muted">Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 dashboard-stat-muted">No active sessions</div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-4 bg-app-surface rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium dashboard-stat-value">Session ID</p>
                        <p className="text-xs dashboard-stat-muted font-mono">{session.id}</p>
                        <p className="text-xs dashboard-stat-muted mt-1">
                          Expires: {new Date(session.expiresAt * 1000).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevokeSession(session.id)}
                        className="px-3 py-1 text-sm bg-app-trend-down text-white rounded hover:opacity-90"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-6">
                <button
                  onClick={() => {
                    setShowSessionsModal(false)
                    setSelectedUser(null)
                    setSessions([])
                  }}
                  className="w-full admin-btn-secondary px-4 py-2"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        )}
        </div>
      </div>
    </div>
  )
}
