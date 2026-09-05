import { describe, expect, it } from 'vitest'
import { normalizeDimensions } from '../src/dimensions.js'

describe('normalizeDimensions array input', () => {
  it('does not treat array indexes as dimension keys', () => {
    expect(normalizeDimensions({
      fileName: 'QFN.kicad_mod',
      pkgType: 'qfn',
      dimensions: [5, 'pitch'],
    })).toEqual({
      fileName: 'QFN.kicad_mod',
      pkgType: 'qfn',
      dimensions: {},
    })
  })
})
