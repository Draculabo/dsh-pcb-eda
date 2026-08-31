import { describe, expect, it } from 'vitest'
import { ProgressStore } from '../src/progress.js'

describe('ProgressStore TTL configuration', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid ttlMs value %s',
    (ttlMs) => {
      expect(() => new ProgressStore({ ttlMs })).toThrow('ttlMs must be a positive finite number')
    },
  )

  it('accepts a positive finite TTL', () => {
    expect(() => new ProgressStore({ ttlMs: 1 })).not.toThrow()
  })
})
