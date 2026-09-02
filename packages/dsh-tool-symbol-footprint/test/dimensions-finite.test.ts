import { describe, expect, it } from 'vitest'
import { normalizeDimensions } from '../src/dimensions.js'

describe('normalizeDimensions finite numeric values', () => {
  it('drops non-finite numeric dimensions while preserving valid scalars', () => {
    expect(normalizeDimensions({
      fileName: 'QFN-32.kicad_mod',
      pkgType: 'qfn',
      dimensions: {
        width: 5,
        height: Number.NaN,
        pitch: Number.POSITIVE_INFINITY,
        label: 'standard',
        exposedPad: true,
      },
    })).toEqual({
      fileName: 'QFN-32.kicad_mod',
      pkgType: 'qfn',
      dimensions: {
        width: 5,
        label: 'standard',
        exposedPad: true,
      },
    })
  })
})
