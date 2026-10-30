import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'

/**
 * Renders children only for a user who can write, and sends anyone else to `redirectTo`.
 * Keeping the check outside the children lets their hooks run on every render.
 */
export default function WriteGuard({ redirectTo, children }: { redirectTo: string; children: ReactNode }) {
  const { canWrite } = useUser()
  if (!canWrite) return <Navigate to={redirectTo} replace />
  return <>{children}</>
}
