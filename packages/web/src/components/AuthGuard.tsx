import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Don't redirect while loading
    if (loading) return

    // If no user and not already on login or setup page, redirect to login
    // But only if we're not in the middle of a login flow (check if we just came from login)
    if (!user && location.pathname !== '/login' && location.pathname !== '/setup') {
      // Small delay to avoid race condition with login state updates
      const timer = setTimeout(() => {
        if (!user) {
          navigate('/login', { 
            state: { from: location },
            replace: true 
          })
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [user, loading, navigate, location])

  // Show nothing while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // If no user, don't render children (redirect will happen)
  if (!user) {
    return null
  }

  // User is authenticated, render children
  return <>{children}</>
}
