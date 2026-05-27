import { useQuery } from '@tanstack/react-query'
import { studiesApi } from '../lib/api/studies'
import { cellLinesApi, plasmidsApi, standardsApi } from '../lib/api/reference-data'
import { reagentsApi } from '../lib/api/reagents'
import { useSpecimenTypes } from './useReferenceData'
import { useControlDefinitionsList } from './useControls'

export type SpecimenFormSourceType =
  | 'subject'
  | 'control'
  | 'reagent'
  | 'cell_line'
  | 'plasmid'
  | 'standard'

const specimenFormKeys = {
  all: ['specimen-form'] as const,
  studies: () => [...specimenFormKeys.all, 'studies'] as const,
  subjects: (studyId: number) => [...specimenFormKeys.all, 'subjects', studyId] as const,
  reagents: () => [...specimenFormKeys.all, 'reagents'] as const,
  cellLines: () => [...specimenFormKeys.all, 'cell-lines'] as const,
  plasmids: () => [...specimenFormKeys.all, 'plasmids'] as const,
  standards: () => [...specimenFormKeys.all, 'standards'] as const,
}

/** Bootstrap catalogs for {@link SpecimenForm} (replaces inline useEffect + api.get loads). */
export function useSpecimenFormCatalogs(options: {
  studyId: number
  sourceType: SpecimenFormSourceType
}) {
  const { studyId, sourceType } = options

  const studiesQuery = useQuery({
    queryKey: specimenFormKeys.studies(),
    queryFn: () => studiesApi.list(undefined, { page: 1, limit: 10000 }),
  })

  const specimenTypesQuery = useSpecimenTypes({ silent: true })

  const subjectsQuery = useQuery({
    queryKey: specimenFormKeys.subjects(studyId),
    queryFn: () => studiesApi.getSubjects(studyId),
    enabled: sourceType === 'subject' && studyId > 0,
  })

  const controlsQuery = useControlDefinitionsList(sourceType === 'control')

  const reagentsQuery = useQuery({
    queryKey: specimenFormKeys.reagents(),
    queryFn: async () => (await reagentsApi.list()).reagents,
    enabled: sourceType === 'reagent',
  })

  const cellLinesQuery = useQuery({
    queryKey: specimenFormKeys.cellLines(),
    queryFn: async () => (await cellLinesApi.list()).cellLines,
    enabled: sourceType === 'cell_line',
  })

  const plasmidsQuery = useQuery({
    queryKey: specimenFormKeys.plasmids(),
    queryFn: async () => (await plasmidsApi.list()).plasmids,
    enabled: sourceType === 'plasmid',
  })

  const standardsQuery = useQuery({
    queryKey: specimenFormKeys.standards(),
    queryFn: async () => (await standardsApi.list()).standards,
    enabled: sourceType === 'standard',
  })

  return {
    studies: studiesQuery.data?.studies ?? [],
    specimenTypes: specimenTypesQuery.data ?? [],
    subjects: subjectsQuery.data?.subjects ?? [],
    controls: controlsQuery.data ?? [],
    reagents: reagentsQuery.data ?? [],
    cellLines: cellLinesQuery.data ?? [],
    plasmids: plasmidsQuery.data ?? [],
    standards: standardsQuery.data ?? [],
    studiesQuery,
    specimenTypesQuery,
    subjectsQuery,
    controlsQuery,
    reagentsQuery,
    cellLinesQuery,
    plasmidsQuery,
    standardsQuery,
  }
}
