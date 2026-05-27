import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../lib/api/settings'

export const settingsKeys = {
  all: ['settings'] as const,
  allSettings: () => [...settingsKeys.all, 'all'] as const,
}

export function useAllSettings() {
  return useQuery({
    queryKey: settingsKeys.allSettings(),
    queryFn: () => settingsApi.getAll(),
  })
}
