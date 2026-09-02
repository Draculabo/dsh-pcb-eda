import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-artifacts-options-'))
    const service = new HuaqiuArtifactService({ baseDir: root, maxBytes: 0 })

    try {
      const result = await service.create({ type: 'zip', filename: 'empty.zip', content: '' })
      expect(result).toEqual({
        id: expect.stringMatching(/^art_[0-9a-f]+$/),
        type: 'zip',
        filename: 'empty.zip',
        size: 0,
      })
      await expect(service.create({ type: 'zip', filename: 'data.zip', content: 'x' })).rejects.toThrow(/max size/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
