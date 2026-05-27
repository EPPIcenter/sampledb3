import { describe, it, expect } from 'vitest'
import { fromQuery, getQueryErrorMessage } from '../async'

describe('fromQuery', () => {
  it('returns loading when pending', () => {
    expect(
      fromQuery({
        isPending: true,
        isLoading: true,
        isError: false,
        isSuccess: false,
        data: undefined,
      })
    ).toBe('loading')
  })

  it('returns error when query failed', () => {
    expect(
      fromQuery({
        isPending: false,
        isLoading: false,
        isError: true,
        isSuccess: false,
        data: undefined,
      })
    ).toBe('error')
  })

  it('returns empty when isEmpty option is set', () => {
    expect(
      fromQuery(
        {
          isPending: false,
          isLoading: false,
          isError: false,
          isSuccess: true,
          data: [],
        },
        { isEmpty: true }
      )
    ).toBe('empty')
  })

  it('returns ready on success', () => {
    expect(
      fromQuery({
        isPending: false,
        isLoading: false,
        isError: false,
        isSuccess: true,
        data: { studies: [] },
      })
    ).toBe('ready')
  })
})

describe('getQueryErrorMessage', () => {
  it('extracts API error message', () => {
    const err = { response: { data: { error: 'Study not found' } } }
    expect(getQueryErrorMessage(err, 'Fallback')).toBe('Study not found')
  })

  it('uses fallback when no message', () => {
    expect(getQueryErrorMessage(null, 'Fallback')).toBe('Fallback')
  })
})
