import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { refinePaperContainerInbound } from '../paper-container-inbound-refine'

const schema = z
  .object({
    type: z.enum(['paper', 'micronix_tube']),
    containerBarcode: z.string().optional(),
    position: z.string().optional(),
    sublabel: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== 'paper') return
    refinePaperContainerInbound(data, ctx)
  })

describe('refinePaperContainerInbound', () => {
  it('allows sublabel on paper containers', () => {
    const result = schema.safeParse({ type: 'paper', sublabel: 'Spot-A' })
    expect(result.success).toBe(true)
  })

  it('rejects containerBarcode on paper containers', () => {
    const result = schema.safeParse({ type: 'paper', containerBarcode: 'legacy' })
    expect(result.success).toBe(false)
  })

  it('rejects position on paper containers', () => {
    const result = schema.safeParse({ type: 'paper', position: 'A01' })
    expect(result.success).toBe(false)
  })

  it('allows containerBarcode on tube containers', () => {
    const result = schema.safeParse({ type: 'micronix_tube', containerBarcode: 'MT-1', position: 'A01' })
    expect(result.success).toBe(true)
  })
})
