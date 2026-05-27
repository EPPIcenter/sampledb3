import { api } from './client'
export interface User {
  id: number
  email: string
  username?: string
  name: string
  role: 'admin' | 'member' | 'viewer'
  createdAt?: string
  lastLogin?: string
  deletedAt?: string
  approvedAt?: string | null
}

export interface UserSession {
  id: string
  expiresAt: number
}

export const authApi = {
  login: (emailOrUsername: string, password: string) =>
    api.post<{ user: User }>('/auth/login', { emailOrUsername, password }),
  selfRegister: (data: { email: string; name: string; password: string; username?: string | null }) =>
    api.post<{ user: User }>('/auth/self-register', data),
  logout: () => api.post<{ message: string }>('/auth/logout'),
  getCurrentUser: () => api.get<{ user: User }>('/auth/current'),
  switchUser: (userId: number, password: string) =>
    api.post<{ user: User }>('/auth/switch', { userId, password }),
  updateProfile: (data: { name?: string; email?: string; username?: string | null }) =>
    api.patch<{ user: User }>('/auth/me', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.patch<{ message: string }>('/auth/me/password', data),
}
