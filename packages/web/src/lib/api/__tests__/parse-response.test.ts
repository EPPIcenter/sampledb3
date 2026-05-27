import { describe, it, expect } from 'vitest'
import {
  ApiContractError,
  parseApiResponseData,
  parseContainerDetailWire,
  parseSettingsEnvelope,
} from '../parse-response'
import { normalizeContainerDetail } from '../containers'

describe('parse-response', () => {
  describe('parseSettingsEnvelope', () => {
    it('accepts valid GET /settings/:key body', () => {
      const { value } = parseSettingsEnvelope<{ configurations: unknown[] }>(
        { key: 'scanner_configurations', value: { configurations: [] } },
        'scanner_configurations',
      )
      expect(value.configurations).toEqual([])
    })

    it('rejects direct configuration object (pre-P1 bug class)', () => {
      expect(() =>
        parseSettingsEnvelope({ configurations: [] }, 'scanner_configurations'),
      ).toThrow(ApiContractError)
    })

    it('rejects key mismatch', () => {
      expect(() =>
        parseSettingsEnvelope(
          { key: 'export_configurations', value: { configurations: [] } },
          'scanner_configurations',
        ),
      ).toThrow(/expected key/)
    })
  })

  describe('parseApiResponseData', () => {
    it('accepts valid list envelope', () => {
      const data = parseApiResponseData<{ id: number }[]>({
        data: [{ id: 1 }],
        meta: { pagination: { page: 1, limit: 1, total: 1, totalPages: 1 } },
      })
      expect(data).toHaveLength(1)
    })

    it('rejects missing data field', () => {
      expect(() => parseApiResponseData({})).toThrow(ApiContractError)
    })

    it('rejects non-envelope list body', () => {
      expect(() => parseApiResponseData({ items: [] })).toThrow(ApiContractError)
    })
  })

  describe('parseContainerDetailWire', () => {
    it('accepts nested container shape', () => {
      const wire = parseContainerDetailWire({
        container: { id: 9, containerType: 'micronix_tube', specimenId: 1 },
        specimen: null,
        source: null,
      })
      const detail = normalizeContainerDetail(wire)
      expect(detail.container.id).toBe(9)
    })

    it('accepts legacy flat enriched shape', () => {
      const wire = parseContainerDetailWire({
        id: 9,
        containerType: 'micronix_tube',
        specimenId: 1,
        specimen: null,
        source: null,
      })
      expect(normalizeContainerDetail(wire).container.id).toBe(9)
    })

    it('rejects body without container id', () => {
      expect(() =>
        parseContainerDetailWire({ specimen: null, source: null }),
      ).toThrow(ApiContractError)
    })
  })
})
