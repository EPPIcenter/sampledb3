import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { CollectionTableEntry } from '../lib/collection-table-columns'
import { EMPTY_LIST } from '../lib/empty-list'

export interface CollectionSheet {
  id: number
  name?: string
  papers?: CollectionTableEntry[]
}

/**
 * The sheets of a box or bag, and which are expanded. When the sheets first load, 3 or fewer start
 * expanded and more start collapsed; a new `collectionId` starts over.
 */
export function useCollectionSheets(
  collectionId: number,
  contents: { sheets: readonly unknown[] } | undefined,
) {
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set())
  const initializedSheets = useRef(false)

  useEffect(() => {
    initializedSheets.current = false
    setExpandedSheets(new Set())
  }, [collectionId])

  const sheets = useMemo(() => (contents?.sheets ?? EMPTY_LIST) as CollectionSheet[], [contents])

  const initializeExpanded = useEffectEvent(() => {
    if (sheets.length > 0 && !initializedSheets.current) {
      initializedSheets.current = true
      if (sheets.length <= 3) {
        setExpandedSheets(new Set(sheets.map((s) => s.id)))
      }
    }
  })
  // Runs when the sheets first load or the collection changes (its sheets may already be cached),
  // not on every refetch.
  useEffect(() => {
    initializeExpanded()
  }, [collectionId, sheets.length])

  const toggleSheet = (sheetId: number) => {
    setExpandedSheets((prev) => {
      const next = new Set(prev)
      if (next.has(sheetId)) {
        next.delete(sheetId)
      } else {
        next.add(sheetId)
      }
      return next
    })
  }

  return { sheets, expandedSheets, toggleSheet }
}
