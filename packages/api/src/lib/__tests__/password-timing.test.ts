import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { verifyPasswordConstantTime } from '../auth/auth-service'

describe('verifyPasswordConstantTime', () => {
  it('still runs a bcrypt comparison when there is no such user', async () => {
    const compare = vi.spyOn(bcrypt, 'compare')

    const valid = await verifyPasswordConstantTime('guess', undefined)

    expect(valid).toBe(false)
    expect(compare).toHaveBeenCalledTimes(1)
    compare.mockRestore()
  })

  it('checks the real hash when the user exists', async () => {
    const hash = await bcrypt.hash('right', 4)
    expect(await verifyPasswordConstantTime('right', hash)).toBe(true)
    expect(await verifyPasswordConstantTime('wrong', hash)).toBe(false)
  })
})
