import { describe, it, expect, vi } from 'vitest'
import { createMockedDomainModule } from '../mock-api'
import { axiosApi, type ApiClient } from '../../../lib/api/client'

describe('createMockedDomainModule', () => {
  it('replaces a valid domain export', async () => {
    const list = vi.fn()
    const mod = await createMockedDomainModule('studies', {
      studiesApi: { list },
    })
    expect((mod.studiesApi as { list: unknown }).list).toBe(list)
  })

  it('throws when an override key is not valid for the domain, naming the key and valid keys', async () => {
    await expect(
      createMockedDomainModule('studies', {
        statesApi: { list: vi.fn() },
      })
    ).rejects.toThrow(/statesApi.*studiesApi/)
  })

  it('throws when an override key belongs to another domain', async () => {
    await expect(
      createMockedDomainModule('studies', {
        studiesApi: { list: vi.fn() },
        subjectsApi: { list: vi.fn() },
      })
    ).rejects.toThrow(/subjectsApi.*studiesApi/)
  })

  it('throws for client when an ignored api key is passed instead of default', async () => {
    await expect(
      createMockedDomainModule('client', {
        api: { get: vi.fn() },
      })
    ).rejects.toThrow(/api.*default/)
  })

  it('merges default overrides onto the unwrapped api client and leaves axiosApi real', async () => {
    const get = vi.fn()
    const mod = await createMockedDomainModule('client', {
      default: { get },
    })
    const mockedApi = mod.api as ApiClient
    expect(mockedApi.get).toBe(get)
    expect(typeof mockedApi.post).toBe('function')
    expect(mod.axiosApi).toBe(axiosApi)
    expect(mod).not.toHaveProperty('default')
  })
})
