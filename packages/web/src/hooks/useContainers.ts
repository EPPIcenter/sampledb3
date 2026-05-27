import { useQuery } from '@tanstack/react-query'
import { containersApi, type ContainerDetail } from '../lib/api/containers'
import { derivationsApi } from '../lib/api/derivations'

export const containerKeys = {
  all: ['containers'] as const,
  detail: (id: number) => [...containerKeys.all, 'detail', id] as const,
  derivations: (id: number) => [...containerKeys.all, id, 'derivations'] as const,
  source: (id: number) => [...containerKeys.all, id, 'source'] as const,
}

export function useContainer(id: number) {
  return useQuery({
    queryKey: containerKeys.detail(id),
    queryFn: () => containersApi.get(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

export function useContainerDerivations(containerId: number) {
  return useQuery({
    queryKey: containerKeys.derivations(containerId),
    queryFn: async () => {
      const response = await derivationsApi.listFromContainer(containerId)
      return response.derivations
    },
    enabled: Number.isFinite(containerId) && containerId > 0,
  })
}

export function useContainerSource(containerId: number) {
  return useQuery({
    queryKey: containerKeys.source(containerId),
    queryFn: async () => {
      try {
        return await derivationsApi.getSource(containerId)
      } catch (err: unknown) {
        const status =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined
        if (status === 404) return null
        throw err
      }
    },
    enabled: Number.isFinite(containerId) && containerId > 0,
  })
}

export function useContainerDerivationTree(containerId: number) {
  return useQuery({
    queryKey: [...containerKeys.derivations(containerId), 'tree'] as const,
    queryFn: async () => {
      const response = await derivationsApi.listFromContainer(containerId)
      const derivations = response.derivations
      const childContainers = new Map<number, ContainerDetail>()
      await Promise.all(
        derivations.map(async (derivation) => {
          if (!derivation.childContainerId) return
          try {
            const detail = await containersApi.get(derivation.childContainerId)
            childContainers.set(derivation.childContainerId, detail)
          } catch {
            // omit failed child loads
          }
        }),
      )
      return { derivations, childContainers }
    },
    enabled: Number.isFinite(containerId) && containerId > 0,
  })
}
