import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../lib/api/auth'
import { setupApi } from '../lib/api/settings'
import { getQueryErrorMessage } from '../ui'
import { useToast } from '../contexts/ToastContext'

export const setupKeys = {
  all: ['setup'] as const,
  status: () => [...setupKeys.all, 'status'] as const,
}

/** Whether initial system setup has completed. */
export function useSetupStatus() {
  return useQuery({
    queryKey: setupKeys.status(),
    queryFn: () => setupApi.status(),
    staleTime: 0,
  })
}

export type SetupInitializePayload = Parameters<typeof setupApi.initialize>[0]

export function useInitializeSetup(options?: { silent?: boolean }) {
  const queryClient = useQueryClient()
  const { error: showError } = useToast()

  return useMutation({
    mutationFn: (data: SetupInitializePayload) => setupApi.initialize(data),
    onError: (err: unknown) => {
      if (options?.silent) return
      showError(getQueryErrorMessage(err, 'Setup failed'))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.status() })
    },
  })
}

export function useLogin(options?: { silent?: boolean }) {
  const { error: showError } = useToast()

  return useMutation({
    mutationFn: ({
      emailOrUsername,
      password,
    }: {
      emailOrUsername: string
      password: string
    }) => authApi.login(emailOrUsername, password),
    onError: (err: unknown) => {
      if (options?.silent) return
      showError(getLoginErrorMessage(err))
    },
  })
}

export function useSelfRegister(options?: { silent?: boolean }) {
  const { error: showError } = useToast()

  return useMutation({
    mutationFn: (data: { email: string; name: string; password: string }) =>
      authApi.selfRegister(data),
    onError: (err: unknown) => {
      if (options?.silent) return
      showError(getQueryErrorMessage(err, 'Registration failed. Please try again.'))
    },
  })
}

/** Inline login/register error copy (forms own display with `{ silent: true }`). */
export function getLoginErrorMessage(err: unknown): string {
  const apiMessage = getQueryErrorMessage(err, '')
  if (apiMessage === 'Account pending approval') {
    return 'Your account is pending approval. An administrator will approve it before you can sign in.'
  }
  return apiMessage || 'Login failed. Please check your credentials.'
}
