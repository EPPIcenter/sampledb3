import { describe, it, expect } from 'vitest'
import { getFilterArrayValue, toggleArrayFilterValue } from '../filter-array-toggle'

describe('toggleArrayFilterValue', () => {
  it('adds a value when the array field is undefined', () => {
    const next = toggleArrayFilterValue<{ tag_ids?: number[] }, 'tag_ids'>(
      {},
      'tag_ids',
      1
    )
    expect(next.tag_ids).toEqual([1])
  })

  it('removes a value when it is already selected', () => {
    const next = toggleArrayFilterValue(
      { container_types: ['micronix_tube', 'paper'] },
      'container_types',
      'micronix_tube'
    )
    expect(next.container_types).toEqual(['paper'])
  })

  it('appends a value when the array exists', () => {
    const next = toggleArrayFilterValue(
      { container_types: ['paper'] },
      'container_types',
      'micronix_tube'
    )
    expect(next.container_types).toEqual(['paper', 'micronix_tube'])
  })
})

describe('getFilterArrayValue', () => {
  it('returns empty array when field is unset', () => {
    expect(getFilterArrayValue<{ tag_ids?: string[] }, 'tag_ids'>({}, 'tag_ids')).toEqual([])
  })

  it('returns the stored array when set', () => {
    expect(getFilterArrayValue({ tag_ids: ['a'] }, 'tag_ids')).toEqual(['a'])
  })
})
