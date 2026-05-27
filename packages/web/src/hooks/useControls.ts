import { useQuery } from '@tanstack/react-query'
import { controlsApi, type ControlBatch, type ControlDefinition } from '../lib/api/controls'
import { strainsApi } from '../lib/api/reference-data'
import type { Strain } from '../lib/api/reference-data'
import { getCompositionKey } from '../lib/composition-key'

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

export function useControlDefinitionsList(enabled = true) {
  return useQuery({
    queryKey: [...controlKeys.all, 'definitions-list'] as const,
    queryFn: async () => {
      const res = await controlsApi.list()
      return res.controls.map(normalizeDefinition)
    },
    enabled,
  })
}

export function useControlDefinitionSummary(definitionId: number) {
  return useQuery({
    queryKey: controlKeys.definition(definitionId),
    queryFn: () => controlsApi.getDefinitionSummary(definitionId),
    enabled: Number.isFinite(definitionId) && definitionId > 0,
  })
}

export function useControlDefinitionDetail(definitionId: number, enabled = true) {
  return useQuery({
    queryKey: [...controlKeys.all, 'definition-detail', definitionId] as const,
    queryFn: async () => {
      const res = await controlsApi.get(definitionId)
      return normalizeDefinition(res.control)
    },
    enabled: enabled && Number.isFinite(definitionId) && definitionId > 0,
  })
}

export function useControlBatchWizardBootstrap(batchId: number | undefined) {
  return useQuery({
    queryKey: [...controlKeys.all, 'wizard-batch', batchId] as const,
    queryFn: async () => {
      const batchRes = await controlsApi.getBatch(batchId!)
      const defRes = await controlsApi.get(batchRes.batch.controlDefinitionId)
      return {
        batch: batchRes.batch,
        controlDefinition: normalizeDefinition(defRes.control),
      }
    },
    enabled: !!batchId && batchId > 0,
  })
}

export function useControlDefinitionWizardSeed(definitionId: number | undefined) {
  return useQuery({
    queryKey: [...controlKeys.all, 'wizard-definition-seed', definitionId] as const,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const [summaryResponse, nameResponse] = await Promise.all([
        controlsApi.getDefinitionSummary(definitionId!),
        controlsApi.suggestBatchName(definitionId!, today),
      ])
      return { summaryResponse, suggestedName: nameResponse.name, productionDate: today }
    },
    enabled: !!definitionId && definitionId > 0,
  })
}

export function useCompositionDefinitionsByKey(compositionKey: string | null | undefined) {
  return useQuery({
    queryKey: [...controlKeys.all, 'composition-definitions', compositionKey] as const,
    queryFn: async () => {
      const res = await controlsApi.list()
      const defs = res.controls
        .map(normalizeDefinition)
        .filter((def) => {
          const defKey = getCompositionKey(
            (def.strains ?? []).map((s) => ({ id: s.id, percentage: s.percentage })),
          )
          return defKey === compositionKey
        })
        .sort((a, b) => (a.targetDensity ?? 0) - (b.targetDensity ?? 0))
      return defs
    },
    enabled: !!compositionKey,
  })
}
