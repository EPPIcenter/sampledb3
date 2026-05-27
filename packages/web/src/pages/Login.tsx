import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { authApi } from '../lib/api/auth';
import { useUser } from '../contexts/UserContext'
import { addRecentUser } from '../lib/localUserHistory'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshUser, setUser } = useUser()
  const [emailOrUsername, setEmailOrUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get redirect path from location state, or default to dashboard
  const state = location.state as { from?: { pathname?: string }; fromSetup?: boolean } | null
  const from = state?.from?.pathname ?? '/'
  const fromSetup = state?.fromSetup ?? false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await authApi.login(emailOrUsername, password)
      // The response structure from axios is: { data: { user: {...} } }
      const userData = response.data.user
      setUser(userData)
      addRecentUser(userData)
      setLoading(false)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      if (message === 'Account pending approval') {
        setError('Your account is pending approval. An administrator will approve it before you can sign in.')
      } else {
        setError(message || 'Login failed. Please check your credentials.')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-app-surface flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <img src="/icon.png" alt="SampleDB" className="h-16 w-auto" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-app-text">
            Sign in to SampleDB
          </h2>
          <p className="mt-2 text-center text-sm text-app-text-muted">
            Enter your credentials to access the application
          </p>
          {fromSetup && (
            <p className="mt-3 text-center text-sm text-app-trend-up font-medium">
              Setup complete! Please sign in with your admin credentials.
            </p>
          )}
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-app-trend-down/10 border border-app-trend-down text-app-trend-down px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="emailOrUsername" className="sr-only">
                Email or Username
              </label>
              <input
                id="emailOrUsername"
                name="emailOrUsername"
                type="text"
                autoComplete="username"
                required
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-app-border placeholder-app-text-muted text-app-text rounded-t-md focus:outline-none focus:ring-app-accent focus:border-app-accent focus:z-10 sm:text-sm"
                placeholder="Email or Username"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-app-border placeholder-app-text-muted text-app-text rounded-b-md focus:outline-none focus:ring-app-accent focus:border-app-accent focus:z-10 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-app-accent hover:bg-app-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          <p className="text-center text-sm text-app-text-muted">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-medium text-app-accent hover:text-app-accent-hover">
              Create account
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
