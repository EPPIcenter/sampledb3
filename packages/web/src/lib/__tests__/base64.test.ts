import { describe, it, expect } from 'vitest'
import { bytesToBase64 } from '../base64'

describe('bytesToBase64', () => {
  it('matches btoa for small input', () => {
    const bytes = new TextEncoder().encode('Well,Cq\nA1,22.1')
    expect(bytesToBase64(bytes)).toBe(btoa('Well,Cq\nA1,22.1'))
  })

  it('encodes files larger than the argument limit', () => {
    const bytes = new Uint8Array(2_000_000).map((_, i) => i % 256)
    const encoded = bytesToBase64(bytes)
    expect(encoded.length).toBe(Math.ceil(bytes.length / 3) * 4)
    expect(atob(encoded).charCodeAt(1_999_999)).toBe(1_999_999 % 256)
  })
})
