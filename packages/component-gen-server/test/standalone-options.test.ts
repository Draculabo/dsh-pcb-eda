import { describe, expect, it } from 'vitest'
import { createStandaloneServer } from '../src/standalone.js'

describe('createStandaloneServer options', () => {
  it.each([
    -1,
    1.5,
    65_536,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects invalid port %s', async (port) => {
    await expect(createStandaloneServer({ port })).rejects.toEqual(
      new RangeError('port must be an integer between 0 and 65535'),
    )
  })
})
