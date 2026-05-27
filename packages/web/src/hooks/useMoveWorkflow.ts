import { useQuery } from '@tanstack/react-query'
import { collectionsApi } from '../lib/api/collections'
import { locationsApi } from '../lib/api/locations'
import { settingsApi } from '../lib/api/settings'
import type { Location } from '../lib/api/types'

export const moveWorkflowKeys = {
  all: ['move-workflow'] as const,
  paperBootstrap: () => [...moveWorkflowKeys.all, 'paper-bootstrap'] as const,
  cryovialBootstrap: () => [...moveWorkflowKeys.all, 'cryovial-bootstrap'] as const,
  micronixBootstrap: () => [...moveWorkflowKeys.all, 'micronix-bootstrap'] as const,
  paperSheets: (type: 'box' | 'bag', id: number) =>
    [...moveWorkflowKeys.all, 'paper-sheets', type, id] as const,
}

export type PaperMoveCollection = {
  id: number
  name: string
  type: 'box' | 'bag'
  itemCount: number
  locationId?: number | null
  location?: { id: number; path: string | null } | null
}

export type PaperMoveSheet = {
  id: number
  name: string
  papers: Array<{
    id: number
    label: string
    container?: {
      specimenId?: number
      state?: { name: string }
      status?: { name: string }
    }
  }>
}

function mapCollectionName(c: { id: number; name?: string | null }, fallback: string): string {
  const name = c.name && typeof c.name === 'string' && c.name.trim() !== '' ? c.name : null
  return name ?? `${fallback} #${c.id}`
}

type CollectionListItem = {
  id: number
  name?: string | null
  barcode?: string | null
  locationId?: number | null
  itemCount?: number
  location?: { path?: string | null } | null
}

export type CryovialMoveBox = {
  id: number
  name: string
  barcode: string | null
  locationId: number | null
  itemCount: number
  locationPath: string | null
}

export type MicronixMovePlate = {
  id: number
  name: string
  barcode: string | null
  locationId: number | null
  itemCount: number
  locationPath: string | null
}

function mapCryovialBox(c: CollectionListItem): CryovialMoveBox {
  return {
    id: c.id,
    name: c.name ?? `Box #${c.id}`,
    barcode: c.barcode ?? null,
    locationId: c.locationId ?? null,
    itemCount: c.itemCount || 0,
    locationPath: c.location?.path ?? null,
  }
}

function mapMicronixPlate(c: CollectionListItem): MicronixMovePlate {
  return {
    id: c.id,
    name: c.name ?? `Plate #${c.id}`,
    barcode: c.barcode ?? null,
    locationId: c.locationId ?? null,
    itemCount: c.itemCount || 0,
    locationPath: c.location?.path ?? null,
  }
}

export function useCryovialMoveBootstrap() {
  return useQuery({
    queryKey: moveWorkflowKeys.cryovialBootstrap(),
    queryFn: async () => {
      const [collectionsRes, locationsRes] = await Promise.all([
        collectionsApi.listCollectionsByType('cryovial_box'),
        locationsApi.list(),
      ])
      return {
        boxes: collectionsRes.collections.map(mapCryovialBox),
        locations: locationsRes.locations as Location[],
      }
    },
  })
}

export function useMicronixMoveBootstrap() {
  return useQuery({
    queryKey: moveWorkflowKeys.micronixBootstrap(),
    queryFn: async () => {
      const [collectionsRes, locationsRes, scannerConfigs] = await Promise.all([
        collectionsApi.listCollectionsByType('micronix_plate'),
        locationsApi.list(),
        settingsApi.getValue('scanner_configurations'),
      ])
      return {
        plates: collectionsRes.collections.map(mapMicronixPlate),
        locations: locationsRes.locations as Location[],
        scannerConfigurations: scannerConfigs?.configurations ?? [],
      }
    },
  })
}

export function usePaperMoveBootstrap() {
  return useQuery({
    queryKey: moveWorkflowKeys.paperBootstrap(),
    queryFn: async () => {
      const [boxesRes, bagsRes, locationsRes] = await Promise.all([
        collectionsApi.listCollectionsByType('box'),
        collectionsApi.listCollectionsByType('bag'),
        locationsApi.list(),
      ])

      const boxes: PaperMoveCollection[] = boxesRes.collections.map((c) => ({
        id: c.id,
        name: mapCollectionName(c, 'Box'),
        type: 'box' as const,
        itemCount: c.itemCount || 0,
        locationId: c.locationId,
        location: c.location,
      }))

      const bags: PaperMoveCollection[] = bagsRes.collections.map((c) => ({
        id: c.id,
        name: mapCollectionName(c, 'Bag'),
        type: 'bag' as const,
        itemCount: c.itemCount || 0,
        locationId: c.locationId,
        location: c.location,
      }))

      return {
        boxes,
        bags,
        locations: locationsRes.locations as Location[],
      }
    },
  })
}

export function usePaperMoveSheets(
  sourceCollectionType: 'box' | 'bag' | null,
  sourceCollectionId: number | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: moveWorkflowKeys.paperSheets(sourceCollectionType ?? 'box', sourceCollectionId ?? 0),
    queryFn: async (): Promise<PaperMoveSheet[]> => {
      const response =
        sourceCollectionType === 'box'
          ? await collectionsApi.getBox(sourceCollectionId!)
          : await collectionsApi.getBag(sourceCollectionId!)

      const contents = response.contents as { sheets?: Array<{ id: number; name: string; papers?: unknown[] }> }
      if (!contents?.sheets) return []

      return contents.sheets.map((s) => ({
        id: s.id,
        name: s.name,
        papers: (s.papers || []).map((raw) => {
          const p = raw as { id: number; position?: string; container?: unknown }
          return {
            id: p.id,
            label: p.position || `Spot #${p.id}`,
            container: p.container as PaperMoveSheet['papers'][0]['container'],
          }
        }),
      }))
    },
    enabled:
      enabled &&
      sourceCollectionType != null &&
      sourceCollectionId != null &&
      sourceCollectionId > 0,
  })
}
