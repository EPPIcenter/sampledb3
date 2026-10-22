import type { SubjectDateFilter } from '@sampledb/contract'
import type { specimen, storageContainer } from '../../db/schema'
import type { ContainerSubtype } from '../container-placement'

/** An inclusive date range. A bare `YYYY-MM-DD` upper bound includes that whole day. */
export interface DateRange {
  from?: string
  to?: string
}

/** Filters every selection takes, except a micronix barcode list (ADR 0011). */
export interface ContainerSelectionFilters {
  /** Specimen types; empty or omitted means every type. */
  specimenTypeIds?: readonly number[]
  /** Collection date range. A listed Subject with its own dates ignores it. */
  collectionDate?: DateRange
  /** When the Specimen was created. */
  specimenCreated?: DateRange
  /** When the Container was created. A Container-level filter. */
  containerCreated?: DateRange
  /** Container types (`ContainerSubtype` values); unknown values match nothing. A Container-level filter. */
  containerTypes?: readonly string[]
  /** Containers carrying every one of these Tags. A Container-level filter. */
  tagIds?: readonly number[]
  /** Containers stored in this Location or any Location under it. A Container-level filter. */
  locationId?: number
}

/** One listed Subject of a subject-list selection. */
export interface SubjectSelectionEntry {
  studyId: number
  subjectId: number
  /**
   * This Subject's collection dates; several are alternatives (one per visit). Omitted or
   * empty: the global collection-date range applies. When a Subject is listed more than
   * once, an undated entry wins.
   */
  dates?: readonly SubjectDateFilter[]
}

/** What to select from (ADR 0011). Every id is resolved by the caller; an unknown id matches nothing. */
export type ContainerSelection =
  | { kind: 'study'; studyId: number; filters?: ContainerSelectionFilters }
  | {
      kind: 'subjects'
      subjects: readonly SubjectSelectionEntry[]
      /** Days either side of each exact per-Subject date. Ranges are not widened. */
      dateTolerance?: number
      filters?: ContainerSelectionFilters
    }
  | { kind: 'micronixBarcodes'; barcodes: readonly string[] }
  | {
      kind: 'database'
      /** Specimens of Subjects or of Control batches; omitted means both. */
      sourceType?: 'subject' | 'control'
      filters?: ContainerSelectionFilters
    }

export type SelectedContainer = typeof storageContainer.$inferSelect
export type SelectedSpecimen = typeof specimen.$inferSelect

export interface ContainerSelectionResult {
  /** Matching Containers, ordered by id. */
  containers: SelectedContainer[]
  /**
   * Matching Specimens, ordered by id. With no Container-level filter, every matching
   * Specimen, with or without Containers; with one, only Specimens that have a matching Container.
   */
  specimens: SelectedSpecimen[]
  /** Each selected Container's type, by Container id. */
  containerTypes: Map<number, ContainerSubtype>
}
