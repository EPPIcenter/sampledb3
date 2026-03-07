import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Don't redirect while loading
    if (loading) return

    // If no user, redirect to login
    if (!user) {
      navigate('/login', { 
        state: { from: location },
        replace: true 
      })
      return
    }

    // If user is not an admin, redirect to dashboard
    if (user.role !== 'admin') {
      navigate('/', { replace: true })
      return
    }
  }, [user, loading, navigate, location])

  // Show nothing while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-app-surface flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-app-accent"></div>
          <p className="mt-4 text-app-text-muted">Loading...</p>
        </div>
      </div>
    )
  }

  // If no user or not admin, don't render children (redirect will happen)
  if (!user || user.role !== 'admin') {
    return null
  }

  // User is authenticated and is admin, render children
  return <>{children}</>
}
