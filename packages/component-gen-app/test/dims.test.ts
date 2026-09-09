import { describe, expect, it } from 'vitest'
import { dimensionBounds } from '../src/utils/dims.js'

describe('dimensionBounds', () => {
  it('uses default bounds for inherited object keys', () => {
    expect(dimensionBounds('__proto__')).toEqual({ min: 0.01, max: 1000 })
    expect(dimensionBounds('constructor')).toEqual({ min: 0.01, max: 1000 })
  })
})
