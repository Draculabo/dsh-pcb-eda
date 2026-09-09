import { describe, expect, it } from 'vitest'
import { parseAuthMessage } from '../src/client/lib.js'

describe('parseAuthMessage credential validation', () => {
  it('rejects whitespace-only credentials', () => {
    expect(parseAuthMessage({
      category: 1,
      data: { type: 'update_access_token', data: { userId: '   ', token: 'token' } },
    })).toBeNull()

    expect(parseAuthMessage({
      category: 1,
      data: { type: 'update_access_token', data: { userId: 'user', token: '   ' } },
    })).toBeNull()
  })
})
