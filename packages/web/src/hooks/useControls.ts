import { useQuery } from '@tanstack/react-query'
import { controlsApi, type ControlBatch, type ControlDefinition } from '../lib/api/controls'
import { strainsApi } from '../lib/api/reference-data'
import type { Strain } from '../lib/api/reference-data'

export const controlKeys = {
  all: ['blood-controls'] as const,
  overview: () => [...controlKeys.all, 'overview'] as const,
  definition: (id: number) => [...controlKeys.all, 'definition', id] as const,
  batchSummary: (id: number) => [...controlKeys.all, 'batch-summary', id] as const,
}

function normalizeDefinition(d: ControlDefinition): ControlDefinition {
  return {
    ...d,
    specimenCount: Number(d.specimenCount || 0),
    batchCount: Number(d.batchCount || 0),
    spotCount: Number(d.spotCount || 0),
    micronixCount: Number(d.micronixCount || 0),
    cryovialCount: Number(d.cryovialCount || 0),
    staticWellCount: Number(d.staticWellCount || 0),
    tubeCount: Number(d.tubeCount || 0),
    inventoryTotal: Number(d.inventoryTotal || 0),
  }
}

function normalizeBatch(b: ControlBatch & { definitionName?: string }) {
  return {
    ...b,
    specimenCount: Number(b.specimenCount || 0),
    spotCount: Number(b.spotCount || 0),
    micronixCount: Number(b.micronixCount || 0),
    cryovialCount: Number(b.cryovialCount || 0),
    staticWellCount: Number(b.staticWellCount || 0),
    tubeCount: Number(b.tubeCount || 0),
    inventoryTotal: Number(b.inventoryTotal || 0),
  }
}

export function useBloodControlsOverview() {
  return useQuery({
    queryKey: controlKeys.overview(),
    queryFn: async () => {
      const [defsRes, batchesRes, strainsRes] = await Promise.all([
        controlsApi.list(),
        controlsApi.listAllBatches(),
        strainsApi.list(),
      ])
      return {
        definitions: defsRes.controls.map(normalizeDefinition),
        batches: batchesRes.batches.map(normalizeBatch),
        strains: strainsRes.data as Strain[],
      }
    },
  })
}

export function useControlBatchSummary(batchId: number) {
  return useQuery({
    queryKey: controlKeys.batchSummary(batchId),
    queryFn: () => controlsApi.getBatchSummary(batchId),
    enabled: Number.isFinite(batchId) && batchId > 0,
  })
}

export function useControlDefinitionsList() {
  return useQuery({
    queryKey: [...controlKeys.all, 'definitions-list'] as const,
    queryFn: async () => {
      const res = await controlsApi.list()
      return res.controls.map(normalizeDefinition)
    },
  })
}

export function useControlDefinitionSummary(definitionId: number) {
  return useQuery({
    queryKey: controlKeys.definition(definitionId),
    queryFn: () => controlsApi.getDefinitionSummary(definitionId),
    enabled: Number.isFinite(definitionId) && definitionId > 0,
  })
}
