import { describe, expect, it } from 'vitest'
import { HuaqiuArtifactService } from '../src/service.js'

describe('HuaqiuArtifactService options', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid maxBytes value %s',
    (maxBytes) => {
      expect(() => new HuaqiuArtifactService({ maxBytes })).toThrow(
        'maxBytes must be a finite positive number',
      )
    },
  )
})
