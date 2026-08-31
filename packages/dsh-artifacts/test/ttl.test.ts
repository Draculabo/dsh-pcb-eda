import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { HuaqiuArtifactService } from '../src/service.js'

describe('artifact TTL validation', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid ttlSeconds %s before writing an artifact',
    async (ttlSeconds) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-artifacts-ttl-test-'))
      roots.push(root)
      const service = new HuaqiuArtifactService({ baseDir: root })

      await expect(service.create({
        type: 'schematic',
        filename: 'board.kicad_sch',
        content: '(kicad_sch)',
        ttlSeconds,
      })).rejects.toThrow('ttlSeconds must be a positive finite number')

      expect(fs.existsSync(path.join(root, 'dsh-artifacts'))).toBe(false)
    },
  )
})
