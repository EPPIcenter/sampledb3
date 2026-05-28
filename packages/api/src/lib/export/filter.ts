import type { Database } from '../../db/client'
import type { ContainerSubtype } from '../container-placement'
import { resolveContainerTypes } from '../container-placement'

const EXPORTABLE_SUBTYPES: ContainerSubtype[] = [
  'micronix_tube',
  'cryovial_tube',
  'paper',
  'static_well',
]

/** Filter container IDs to those matching export container_types via placement reads. */
export async function filterContainerIdsByType(
  database: Database,
  containerIds: number[],
  containerTypeFilter?: string[],
): Promise<number[]> {
  if (!containerTypeFilter || containerTypeFilter.length === 0) {
    return containerIds
  }

  if (containerIds.length === 0) {
    return []
  }

  const allowedTypes = new Set(
    containerTypeFilter.filter((type): type is ContainerSubtype =>
      EXPORTABLE_SUBTYPES.includes(type as ContainerSubtype),
    ),
  )

  if (allowedTypes.size === 0) {
    return []
  }

  const typeMap = await resolveContainerTypes(database, containerIds)
  return containerIds.filter((id) => {
    const containerType = typeMap.get(id)
    return containerType !== undefined && allowedTypes.has(containerType)
  })
}
