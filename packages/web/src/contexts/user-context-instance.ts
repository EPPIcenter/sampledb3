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
  canManageReferenceData: boolean
  isAdmin: boolean
  isMember: boolean
  isViewer: boolean
}

export const UserContext = createContext<UserContextType | undefined>(undefined)
