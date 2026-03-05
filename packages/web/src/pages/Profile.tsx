import { useState } from 'react'
import { authApi } from '../lib/api'
import { useUser } from '../contexts/UserContext'
import '../styles/profile.css'

function ProfileFormInner({ user }: { user: NonNullable<ReturnType<typeof useUser>['user']> }) {
  const { refreshUser } = useUser()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [profileForm, setProfileForm] = useState({
    name: user.name || '',
    email: user.email || '',
    username: user.username || '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPasswords, setShowPasswords] = useState(false)

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const updateData: { name?: string; email?: string; username?: string | null } = {}
      
      if (profileForm.name !== user.name) {
        updateData.name = profileForm.name
      }
      if (profileForm.email !== user.email) {
        updateData.email = profileForm.email
      }
      if (profileForm.username !== (user.username || '')) {
        updateData.username = profileForm.username || null
      }

      if (Object.keys(updateData).length === 0) {
        setError('No changes to save')
        setLoading(false)
        return
      }

      await authApi.updateProfile(updateData)
      setSuccess('Profile updated successfully')
      setTimeout(() => setSuccess(null), 3000)
      await refreshUser()
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(message ?? 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match')
      setLoading(false)
      return
    }

    try {
      await authApi.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setSuccess('Password changed successfully')
      setTimeout(() => setSuccess(null), 3000)
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(message ?? 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="profile-page">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="mb-6 profile-reveal profile-reveal-1">
          <h1 className="text-3xl font-bold dashboard-stat-value">My Profile</h1>
          <p className="mt-1 text-sm dashboard-stat-muted profile-description">
            Manage your account information and security settings
          </p>
        </div>

        {error && (
          <div className="mb-6 profile-alert-error px-4 py-3 rounded-md text-sm profile-reveal profile-reveal-2">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 profile-alert-success px-4 py-3 rounded-md text-sm profile-reveal profile-reveal-2">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* Profile Information Form */}
          <div className="profile-card profile-reveal profile-reveal-3">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium dashboard-stat-value">Profile Information</h2>
              <p className="mt-1 text-sm dashboard-stat-muted profile-description">
                Update your personal information
              </p>
            </div>
          <form onSubmit={handleProfileSubmit} className="px-6 py-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="form-input"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="form-input"
                />
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Username <span className="dashboard-stat-muted text-xs">(optional)</span>
                </label>
                <input
                  type="text"
                  id="username"
                  value={profileForm.username}
                  onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                  placeholder="Leave empty to remove username"
                  className="form-input"
                />
                <p className="mt-1 text-xs dashboard-stat-muted">
                  You can use your username or email to log in
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password Form */}
        <div className="profile-card profile-reveal profile-reveal-4">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium dashboard-stat-value">Change Password</h2>
            <p className="mt-1 text-sm dashboard-stat-muted profile-description">
              Update your password to keep your account secure
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="px-6 py-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    id="currentPassword"
                    required
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    className="form-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
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
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  id="newPassword"
                  required
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="form-input"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  id="confirmPassword"
                  required
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Changing Password...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
        </div>
      </div>
    </div>
  )
}

export default function Profile() {
  const { user } = useUser()
  if (!user) {
    return (
      <div className="profile-page">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          <div className="profile-card p-6">
            <p className="dashboard-stat-muted profile-description">Loading profile...</p>
          </div>
        </div>
      </div>
    )
  }
  return <ProfileFormInner key={user.id} user={user} />
}
