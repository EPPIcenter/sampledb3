import type { Database } from '../../db/client'
import { searchCollections } from './collection-search'
import { searchContainers } from './container-search'
import { searchSpecimens } from './specimen-search'
import { searchStudies } from './study-search'
import { searchSubjects } from './subject-search'
import { resolveSearchTypes, type SearchResult, type UnifiedSearchResponse } from './types'

function includesType(searchTypes: string[], type: string): boolean {
  return searchTypes.includes(type) || searchTypes.includes('all')
}

/** Unified search across specimens, containers, studies, subjects, and collections. */
export async function searchUnified(
  database: Database,
  query: string,
  type?: string,
): Promise<UnifiedSearchResponse> {
  const searchTypes = resolveSearchTypes(type)
  const results: SearchResult[] = []

  if (includesType(searchTypes, 'specimen')) {
    results.push(...(await searchSpecimens(database, query)))
  }

  if (includesType(searchTypes, 'container')) {
    results.push(...(await searchContainers(database, query)))
  }

  if (includesType(searchTypes, 'study')) {
    results.push(...(await searchStudies(database, query)))
  }

  if (includesType(searchTypes, 'subject')) {
    results.push(...(await searchSubjects(database, query)))
  }

  if (includesType(searchTypes, 'collection')) {
    results.push(...(await searchCollections(database, query)))
  }

  return { results, query, count: results.length }
}
