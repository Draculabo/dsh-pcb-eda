import { describe, expect, it, vi } from 'vitest'
import { fetchEdaUserProfile } from '../src/routes.js'

describe('fetchEdaUserProfile', () => {
  it.each([
    ['string result', 'invalid'],
    ['array result', []],
  ])('rejects a malformed %s', async (_label, result) => {
    const doFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 200000, result }),
    } as Response)) as unknown as typeof fetch

    await expect(fetchEdaUserProfile('token', doFetch)).resolves.toBeNull()
  })
})
