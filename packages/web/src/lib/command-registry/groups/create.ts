import type { Command } from '../../commands'
import type { CommandDependencies } from '../command-deps'

function studyDetailId(pathname: string): string | null {
  const m = pathname.match(/^\/studies\/(\d+)$/)
  return m ? m[1] : null
}

function subjectDetailId(pathname: string): string | null {
  const m = pathname.match(/^\/subjects\/(\d+)$/)
  return m ? m[1] : null
}

export function buildCreateCommands(d: CommandDependencies): Command[] {
  const { pathname, search } = d.location
  const out: Command[] = []

  if (pathname === '/' || pathname === '/studies' || /^\/studies\/\d+$/.test(pathname)) {
    out.push({
      id: 'create-study',
      label: 'Create New Study',
      category: 'Create',
      keywords: ['new study', 'create study', 'add study'],
      action: () => d.navigate('/studies/new'),
      context: {
        kind: 'predicate',
        test: (p) => p === '/' || p === '/studies' || /^\/studies\/\d+$/.test(p),
      },
    })
  }

  if (pathname === '/' || pathname === '/specimens' || /^\/subjects\/\d+$/.test(pathname)) {
    out.push({
      id: 'create-specimen',
      label: 'Create New Specimen',
      category: 'Create',
      keywords: ['new specimen', 'create specimen', 'add specimen'],
      action: () => d.navigate('/specimens/new'),
      context: {
        kind: 'predicate',
        test: (p) => p === '/' || p === '/specimens' || /^\/subjects\/\d+$/.test(p),
      },
    })
  }

  const studyId = studyDetailId(pathname)
  if (studyId) {
    out.push({
      id: 'create-subject',
      label: 'Create New Subject',
      category: 'Create',
      keywords: ['new subject', 'create subject', 'add subject'],
      action: () => {
        d.navigate(`/studies/${studyId}?createSubject=true`)
      },
      context: {
        kind: 'routes',
        routes: [{ path: `/studies/${studyId}`, match: 'exact' }],
      },
    })

    out.push({
      id: 'export-current-study',
      label: 'Export This Study',
      category: 'Export',
      keywords: ['export', 'download', 'csv', 'excel', 'export study'],
      description: 'Open export for the current study',
      action: () => {
        d.navigate(`/export?study=${studyId}`)
      },
      context: {
        kind: 'routes',
        routes: [{ path: `/studies/${studyId}`, match: 'exact' }],
      },
    })
  }

  const subjectId = subjectDetailId(pathname)
  if (subjectId) {
    out.push({
      id: 'create-specimen-subject',
      label: 'Create New Specimen for Subject',
      category: 'Create',
      keywords: ['new specimen', 'create specimen', 'add specimen'],
      action: () => {
        d.navigate(`/subjects/${subjectId}?createSpecimen=true`)
      },
      context: {
        kind: 'routes',
        routes: [{ path: `/subjects/${subjectId}`, match: 'exact' }],
      },
    })
  }

  const hasActiveFilters =
    (pathname === '/specimens' || pathname === '/studies' || pathname === '/statistics') &&
    Boolean(search && search.length > 0)

  if (hasActiveFilters) {
    out.push({
      id: 'clear-filters',
      label: 'Clear Filters',
      category: 'Actions',
      keywords: ['clear filters', 'reset filters', 'remove filters'],
      action: d.handleClearFilters,
      context: {
        kind: 'predicate',
        test: (p) => p === '/specimens' || p === '/studies' || p === '/statistics',
      },
    })
  }

  return out
}
