import { afterEach, describe, expect, it } from 'vitest'
import { getAppBuildId } from '../app-build-id'

describe('getAppBuildId', () => {
  const prev = process.env.APP_BUILD_ID

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.APP_BUILD_ID
    } else {
      process.env.APP_BUILD_ID = prev
    }
  })

  it('uses APP_BUILD_ID when set to a non-empty value', () => {
    process.env.APP_BUILD_ID = 'abc123'
    expect(getAppBuildId()).toBe('abc123')
  })

  it('trims APP_BUILD_ID', () => {
    process.env.APP_BUILD_ID = '  x  '
    expect(getAppBuildId()).toBe('x')
  })

  it('falls back when unset or empty', () => {
    delete process.env.APP_BUILD_ID
    expect(getAppBuildId()).toBe('local-dev')
    process.env.APP_BUILD_ID = '   '
    expect(getAppBuildId()).toBe('local-dev')
  })
})
