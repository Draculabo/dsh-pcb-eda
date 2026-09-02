import { describe, expect, it, vi } from 'vitest'
import { TokenValidator } from '../src/validation.js'

describe('TokenValidator validation URL', () => {
  it('preserves existing query parameters when adding the token', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ result: true }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const validator = new TokenValidator({
      validateUrl: 'https://example.test/validate?source=dsh',
      fetchImpl,
    })

    await expect(validator.validate('tok+value')).resolves.toEqual({ status: 'valid' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const [url, init] = fetchImpl.mock.calls[0]!
    expect({ url: String(url), init }).toEqual({
      url: 'https://example.test/validate?source=dsh&token=tok%2Bvalue',
      init: {
        method: 'GET',
        headers: { accept: 'application/json' },
      },
    })
  })
})
