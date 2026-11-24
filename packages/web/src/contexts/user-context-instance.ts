import { createContext } from 'react'
import type { User } from '../lib/api/auth'

/** Stable module: `createContext` must not re-run on HMR of provider logic (see UserContext.tsx). */
export interface UserContextType {
  user: User | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
  switchUser: (userId: number, password: string) => Promise<void>
  setUser: (user: User | null) => void
  canWrite: boolean
  /** Admin only: every write to Reference data and Locations that the three flags below don't cover. */
  canManageReferenceData: boolean
  /** Members and admins create a Location (#141). */
  canCreateLocations: boolean
  /** Members and admins delete a Location; the API refuses one that isn't empty (#141). */
  canDeleteLocations: boolean
  /** Members and admins create a Tag; renaming and deleting one stay with canManageReferenceData (#141). */
  canCreateTags: boolean
  isAdmin: boolean
  isMember: boolean
  isViewer: boolean
}

export const UserContext = createContext<UserContextType | undefined>(undefined)
