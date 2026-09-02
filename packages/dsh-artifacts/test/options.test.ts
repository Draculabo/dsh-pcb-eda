import { describe, expect, it } from 'vitest'
import { HuaqiuArtifactService } from '../src/service.js'

describe('HuaqiuArtifactService options', () => {
  it('rejects maxBytes values that would disable the storage cap', () => {
    expect(() => new HuaqiuArtifactService({ maxBytes: Number.NaN })).toThrow(
      'maxBytes must be a finite non-negative number',
    )
    expect(() => new HuaqiuArtifactService({ maxBytes: Number.POSITIVE_INFINITY })).toThrow(
      'maxBytes must be a finite non-negative number',
    )
    expect(() => new HuaqiuArtifactService({ maxBytes: -1 })).toThrow(
      'maxBytes must be a finite non-negative number',
    )
  })

  it('preserves zero as a valid explicit size cap', async () => {
    const service = new HuaqiuArtifactService({ maxBytes: 0 })

    await expect(service.create({ type: 'zip', filename: 'empty.zip', content: '' })).resolves.toMatchObject({
      type: 'zip',
      filename: 'empty.zip',
      size: 0,
    })
    await expect(service.create({ type: 'zip', filename: 'data.zip', content: 'x' })).rejects.toThrow(/max size/)
  })
})
