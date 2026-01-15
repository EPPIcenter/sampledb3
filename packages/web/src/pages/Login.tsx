import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { authApi } from '../lib/api'
import { useUser } from '../contexts/UserContext'
import { addRecentUser } from '../lib/localUserHistory'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, refreshUser, setUser } = useUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginSuccess, setLoginSuccess] = useState(false)

  // Get redirect path from location state, or default to dashboard
  const from = (location.state as any)?.from?.pathname || '/'

  // Redirect after successful login when user is set
  useEffect(() => {
    if (loginSuccess && user) {
      setLoading(false)
      navigate(from, { replace: true })
    }
  }, [loginSuccess, user, navigate, from])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await authApi.login(email, password)
      // The response structure from axios is: { data: { user: {...} } }
      // So we access response.data.user
      const userData = response.data?.user
      if (userData) {
        setUser(userData)
        // Save to local user history
        addRecentUser(userData)
        setLoginSuccess(true)
        // Don't set loading to false here - let the useEffect handle navigation
      } else {
        // Fallback: refresh user context
        await refreshUser()
        setLoginSuccess(true)
        setLoading(false)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <img src="/icon.png" alt="SampleDB" className="h-16 w-auto" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to SampleDB
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your credentials to access the application
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
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
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center text-sm text-gray-600">
            <p>Test users available:</p>
            <p className="mt-1 text-xs text-gray-500">
              test@test.com, alice@test.com, bob@test.com, carol@test.com
            </p>
            <p className="mt-1 text-xs text-gray-500">Password: password123</p>
          </div>
        </form>
      </div>
    </div>
  )
}
