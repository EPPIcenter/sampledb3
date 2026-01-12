import { Context } from 'hono'
import { ApiResponse, PaginationMeta } from './api-types'

/**
 * Create a standardized success response
 */
export function successResponse<T>(c: Context, data: T, status = 200) {
  return c.json({ data } as ApiResponse<T>, status)
}

/**
 * Create a standardized list response with optional pagination
 */
export function listResponse<T>(
  c: Context, 
  items: T[], 
  pagination?: PaginationMeta
) {
  return c.json({
    data: items,
    meta: pagination ? { pagination } : undefined
  } as ApiResponse<T[]>)
}

/**
 * Create a standardized created response (201 status)
 */
export function createdResponse<T>(c: Context, data: T) {
  return successResponse(c, data, 201)
}
