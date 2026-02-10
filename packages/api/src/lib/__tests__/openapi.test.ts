import { describe, it, expect } from 'vitest'
import { openApiInfo, createOpenApiRoute } from '../openapi'

describe('openapi', () => {
  describe('openApiInfo', () => {
    it('has openapi 3.0.0 and info', () => {
      expect(openApiInfo.openapi).toBe('3.0.0')
      expect(openApiInfo.info?.title).toBe('SampleDB API')
      expect(openApiInfo.info?.version).toBe('1.0.0')
    })
    it('has Error schema', () => {
      expect(openApiInfo.components?.schemas?.Error).toBeDefined()
      expect(openApiInfo.components?.schemas?.Error?.required).toContain('error')
    })
  })

  describe('createOpenApiRoute', () => {
    it('returns a function', () => {
      expect(typeof createOpenApiRoute()).toBe('function')
    })
  })
})
