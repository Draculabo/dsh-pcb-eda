import { describe, expect, it, vi } from 'vitest'
import { TokenValidator } from '../src/validation.js'

describe('TokenValidator TTL configuration', () => {
  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
  ])('rejects invalid ttlMs values: %s', (ttlMs) => {
    expect(() => new TokenValidator({ ttlMs })).toThrow(
      'ttlMs must be a finite non-negative number',
    )
  })

  it('allows zero to explicitly disable validation result caching', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ result: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const validator = new TokenValidator({ ttlMs: 0, fetchImpl })

    await expect(validator.validate('tok')).resolves.toEqual({ status: 'valid' })
    await expect(validator.validate('tok')).resolves.toEqual({ status: 'valid' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
