import type { Command } from '../../commands'
import type { CommandDependencies } from '../command-deps'

function mergeSearch(d: CommandDependencies, mutator: (sp: URLSearchParams) => void): void {
  const sp = new URLSearchParams(d.location.search)
  mutator(sp)
  const next = sp.toString()
  d.navigate({ pathname: d.location.pathname, search: next ? `?${next}` : '' })
}

export function buildContextualCommands(d: CommandDependencies): Command[] {
  const p = d.location.pathname
  const out: Command[] = []

  const studyMatch = p.match(/^\/studies\/(\d+)$/)
  if (studyMatch) {
    const studyId = studyMatch[1]
    out.push(
      {
        id: 'ctx-study-edit',
        label: 'Edit Study',
        category: 'Actions',
        keywords: ['edit', 'study', 'modify'],
        action: () => mergeSearch(d, (sp) => sp.set('editStudy', 'true')),
        context: { kind: 'routes', routes: [{ path: `/studies/${studyId}`, match: 'exact' }] },
        priority: 2,
      },
      {
        id: 'ctx-study-subjects-tab',
        label: 'Open Study Subjects Tab',
        category: 'Actions',
        keywords: ['subjects', 'tab', 'study'],
        action: () => mergeSearch(d, (sp) => sp.set('tab', 'subjects')),
        context: { kind: 'routes', routes: [{ path: `/studies/${studyId}`, match: 'exact' }] },
      },
      {
        id: 'ctx-study-bulk-import',
        label: 'Open Study Bulk Import',
        category: 'Actions',
        keywords: ['import', 'bulk', 'csv', 'study'],
        action: () => d.navigate(`/studies/${studyId}/import`),
        context: { kind: 'routes', routes: [{ path: `/studies/${studyId}`, match: 'exact' }] },
      },
      {
        id: 'ctx-study-copy-id',
        label: 'Copy Study ID',
        category: 'Actions',
        keywords: ['copy', 'id', 'clipboard'],
        action: () => void navigator.clipboard.writeText(studyId),
        context: { kind: 'routes', routes: [{ path: `/studies/${studyId}`, match: 'exact' }] },
      },
      {
        id: 'ctx-study-delete',
        label: 'Open Delete Study…',
        category: 'Actions',
        keywords: ['delete', 'remove', 'archive', 'study'],
        action: () => mergeSearch(d, (sp) => sp.set('deleteStudy', 'true')),
        context: { kind: 'routes', routes: [{ path: `/studies/${studyId}`, match: 'exact' }] },
      },
      {
        id: 'ctx-study-print',
        label: 'Print Study Page',
        category: 'Actions',
        keywords: ['print', 'pdf'],
        action: () => window.print(),
        context: { kind: 'routes', routes: [{ path: `/studies/${studyId}`, match: 'exact' }] },
      }
    )
  }

  const subjectMatch = p.match(/^\/subjects\/(\d+)$/)
  if (subjectMatch) {
    const subjectId = subjectMatch[1]
    out.push(
      {
        id: 'ctx-subject-edit',
        label: 'Edit Subject',
        category: 'Actions',
        keywords: ['edit', 'subject'],
        action: () => mergeSearch(d, (sp) => sp.set('editSubject', 'true')),
        context: { kind: 'routes', routes: [{ path: `/subjects/${subjectId}`, match: 'exact' }] },
        priority: 2,
      },
      {
        id: 'ctx-subject-copy-id',
        label: 'Copy Subject ID',
        category: 'Actions',
        keywords: ['copy', 'id'],
        action: () => void navigator.clipboard.writeText(subjectId),
        context: { kind: 'routes', routes: [{ path: `/subjects/${subjectId}`, match: 'exact' }] },
      },
      {
        id: 'ctx-subject-print',
        label: 'Print Subject Page',
        category: 'Actions',
        keywords: ['print'],
        action: () => window.print(),
        context: { kind: 'routes', routes: [{ path: `/subjects/${subjectId}`, match: 'exact' }] },
      }
    )
  }

  const specimenMatch = p.match(/^\/specimens\/(\d+)$/)
  if (specimenMatch) {
    const specimenId = specimenMatch[1]
    out.push(
      {
        id: 'ctx-specimen-add-container',
        label: 'Add Container to Specimen',
        category: 'Actions',
        keywords: ['container', 'add', 'specimen'],
        action: () => mergeSearch(d, (sp) => sp.set('addContainer', 'true')),
        context: { kind: 'routes', routes: [{ path: `/specimens/${specimenId}`, match: 'exact' }] },
        priority: 2,
      },
      {
        id: 'ctx-specimen-copy-id',
        label: 'Copy Specimen ID',
        category: 'Actions',
        keywords: ['copy', 'id', 'barcode'],
        action: () => void navigator.clipboard.writeText(specimenId),
        context: { kind: 'routes', routes: [{ path: `/specimens/${specimenId}`, match: 'exact' }] },
      },
      {
        id: 'ctx-specimen-print',
        label: 'Print Specimen Page',
        category: 'Actions',
        keywords: ['print'],
        action: () => window.print(),
        context: { kind: 'routes', routes: [{ path: `/specimens/${specimenId}`, match: 'exact' }] },
      }
    )
  }

  const locationMatch = p.match(/^\/locations\/(\d+)$/)
  if (locationMatch) {
    const locationId = locationMatch[1]
    out.push(
      {
        id: 'ctx-location-add-child',
        label: 'Create Child Location',
        category: 'Actions',
        keywords: ['child', 'sub-location', 'new location', 'add'],
        description: 'Open create location with this parent pre-selected',
        action: () => d.navigate(`/locations?createLocation=true&parentId=${locationId}`),
        context: { kind: 'routes', routes: [{ path: `/locations/${locationId}`, match: 'exact' }] },
      },
      {
        id: 'ctx-location-copy-url',
        label: 'Copy Location Page URL',
        category: 'Actions',
        keywords: ['copy', 'url'],
        action: () => void navigator.clipboard.writeText(window.location.href),
        context: { kind: 'routes', routes: [{ path: `/locations/${locationId}`, match: 'exact' }] },
      },
      {
        id: 'ctx-location-print',
        label: 'Print Location Page',
        category: 'Actions',
        keywords: ['print'],
        action: () => window.print(),
        context: { kind: 'routes', routes: [{ path: `/locations/${locationId}`, match: 'exact' }] },
      }
    )
  }

  const collectionDetail = p.match(/^\/collections\/(micronix-plates|cryovial-boxes|boxes|bags|sheets)\/(\d+)$/)
  if (collectionDetail) {
    out.push(
      {
        id: 'ctx-collection-copy-url',
        label: 'Copy Collection Page URL',
        category: 'Actions',
        keywords: ['copy', 'url', 'collection'],
        action: () => void navigator.clipboard.writeText(window.location.href),
        context: {
          kind: 'predicate',
          test: (path) => /^\/collections\/(micronix-plates|cryovial-boxes|boxes|bags|sheets)\/\d+$/.test(path),
        },
      },
      {
        id: 'ctx-collection-print',
        label: 'Print Collection Page',
        category: 'Actions',
        keywords: ['print', 'collection'],
        action: () => window.print(),
        context: {
          kind: 'predicate',
          test: (path) => /^\/collections\/(micronix-plates|cryovial-boxes|boxes|bags|sheets)\/\d+$/.test(path),
        },
      }
    )
  }

  return out
}
