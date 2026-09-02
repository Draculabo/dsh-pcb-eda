import { describe, expect, it, vi } from 'vitest'
import { TokenValidator } from '../src/validation.js'

describe('TokenValidator unavailable retries', () => {
  it('retries after a transient unavailable result instead of caching it', async () => {
    let attempt = 0
    const fetchImpl = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) {
        return { ok: false, status: 503 } as Response
      }
      return { ok: true, status: 200, json: async () => ({ result: true }) } as Response
    }) as unknown as typeof fetch
    const validator = new TokenValidator({ fetchImpl, ttlMs: 60_000 })

    await expect(validator.validate('tok')).resolves.toMatchObject({ status: 'unavailable' })
    await expect(validator.validate('tok')).resolves.toEqual({ status: 'valid' })
    await expect(validator.validate('tok')).resolves.toEqual({ status: 'valid' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
