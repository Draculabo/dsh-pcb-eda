import { describe, expect, it, vi } from 'vitest'
import { TokenValidator } from '../src/validation.js'

describe('TokenValidator blank credentials', () => {
  it('rejects whitespace-only tokens without a remote validation request', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ result: true })))
    const validator = new TokenValidator({ fetchImpl: fetchImpl as typeof fetch })

    await expect(validator.validate('   ')).resolves.toEqual({
      status: 'invalid',
      reason: 'invalid',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
