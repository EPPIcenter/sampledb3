import { z } from 'zod'
import type { User } from '../../db/schema'

/**
 * Common response types for API tests
 */

export interface ErrorResponse {
  error: string
  errorCode?: string
  details?: unknown
}

export interface ValidationErrorResponse {
  error: 'Validation error' | string
  details: z.ZodIssue[]
  errorCode: 'VALIDATION_ERROR'
}

export interface SuccessResponse {
  message: string
}

export interface UserResponse {
  user: {
    id: number
    email: string
    username?: string
    name: string
    role: 'admin' | 'member' | 'viewer'
    approvedAt?: string | null
  }
}

export interface LoginResponse {
  user: Omit<User, 'passwordHash' | 'createdAt' | 'lastLogin' | 'deletedAt'>
}
