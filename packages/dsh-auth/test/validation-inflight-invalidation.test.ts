import { describe, expect, it } from 'vitest'
import { TokenValidator } from '../src/validation.js'

function validationResponse(result: boolean): Response {
  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('TokenValidator in-flight invalidation', () => {
  it('keeps an invalidated request from caching or replacing a newer validation', async () => {
    const pending: Array<(response: Response) => void> = []
    const fetchImpl = (() => new Promise<Response>((resolve) => pending.push(resolve))) as typeof fetch
    const validator = new TokenValidator({ fetchImpl })

    const first = validator.validate('token')
    expect(pending).toHaveLength(1)

    validator.invalidate('token')
    const second = validator.validate('token')
    expect(pending).toHaveLength(2)

    pending[0]!(validationResponse(true))
    await expect(first).resolves.toEqual({ status: 'valid' })
    expect(validator.peek('token')).toBeNull()

    const third = validator.validate('token')
    expect(pending).toHaveLength(2)

    pending[1]!(validationResponse(true))
    await expect(Promise.all([second, third])).resolves.toEqual([
      { status: 'valid' },
      { status: 'valid' },
    ])
    expect(validator.peek('token')).toEqual({ status: 'valid' })
  })
})
