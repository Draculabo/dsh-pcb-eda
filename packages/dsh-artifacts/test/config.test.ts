import { describe, expect, it } from 'vitest'
import { HuaqiuArtifactService } from '../src/service.js'

describe('HuaqiuArtifactService configuration', () => {
  it('rejects invalid maxBytes values', () => {
    for (const maxBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new HuaqiuArtifactService({ maxBytes })).toThrow(
        'maxBytes must be a positive safe integer',
      )
    }
  })

  it('accepts positive safe-integer maxBytes values', () => {
    expect(() => new HuaqiuArtifactService({ maxBytes: 1 })).not.toThrow()
    expect(() => new HuaqiuArtifactService({ maxBytes: Number.MAX_SAFE_INTEGER })).not.toThrow()
  })
})
