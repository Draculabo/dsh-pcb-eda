import { describe, expect, it, vi } from 'vitest'

import { TokenValidator } from '../src/validation.js'

describe('TokenValidator validation URL', () => {
  it('preserves existing query params and replaces the token param', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ result: true }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const validator = new TokenValidator({
      validateUrl: 'https://www.eda.cn/api/token/validate?source=plugin&token=stale',
      fetchImpl,
    })

    await expect(validator.validate('a+b/c')).resolves.toEqual({ status: 'valid' })

    const requested = new URL(String(fetchImpl.mock.calls[0]?.[0]))
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      source: 'plugin',
      token: 'a+b/c',
    })
  })
})
