import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getQueryErrorMessage } from '../ui'
import { useSelfRegister } from '../hooks/useAuthWorkflow'

export default function Register() {
  const registerMutation = useSelfRegister({ silent: true })
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    try {
      await registerMutation.mutateAsync({ email, name, password })
      setSuccess(true)
    } catch (err: unknown) {
      setError(getQueryErrorMessage(err, 'Registration failed. Please try again.'))
    }
  }

  const loading = registerMutation.isPending

  if (success) {
    return (
      <div className="min-h-screen bg-app-surface flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div>
            <div className="flex justify-center">
              <img src="/icon.png" alt="SampleDB" className="h-16 w-auto" />
            </div>
            <h2 className="mt-6 text-2xl font-bold text-app-text">
              Account created
            </h2>
            <p className="mt-4 text-app-text-muted">
              An administrator will approve your account before you can sign in.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-app-accent hover:bg-app-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-accent"
            >
              Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app-surface flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <img src="/icon.png" alt="SampleDB" className="h-16 w-auto" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-app-text">
            Create an account
          </h2>
          <p className="mt-2 text-center text-sm text-app-text-muted">
            Register to request access to SampleDB
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-app-trend-down/10 border border-app-trend-down text-app-trend-down px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-app-text mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-app-border placeholder-app-text-muted text-app-text rounded-md focus:outline-none focus:ring-app-accent focus:border-app-accent focus:z-10 sm:text-sm"
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-app-text mb-1">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-app-border placeholder-app-text-muted text-app-text rounded-md focus:outline-none focus:ring-app-accent focus:border-app-accent focus:z-10 sm:text-sm"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-app-text mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-app-border placeholder-app-text-muted text-app-text rounded-md focus:outline-none focus:ring-app-accent focus:border-app-accent focus:z-10 sm:text-sm"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-app-text mb-1">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-app-border placeholder-app-text-muted text-app-text rounded-md focus:outline-none focus:ring-app-accent focus:border-app-accent focus:z-10 sm:text-sm"
                placeholder="Enter password again"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-app-accent hover:bg-app-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
          <p className="text-center text-sm text-app-text-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-app-accent hover:text-app-accent-hover">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
