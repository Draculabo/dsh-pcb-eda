import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { HuaqiuArtifactService } from '../src/service.js'

describe('HuaqiuArtifactService create failure cleanup', () => {
  let root = ''

  afterEach(() => {
    vi.restoreAllMocks()
    if (root) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes partial artifact data when an atomic write fails', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-artifacts-failure-test-'))
    const service = new HuaqiuArtifactService({ baseDir: root })
    const originalRename = fs.promises.rename

    vi.spyOn(fs.promises, 'rename').mockImplementation(async (oldPath, newPath) => {
      if (String(newPath).endsWith('meta.json')) {
        throw new Error('simulated metadata rename failure')
      }
      await originalRename(oldPath, newPath)
    })

    await expect(service.create({
      type: 'schematic',
      filename: 'board.kicad_sch',
      content: '(kicad_sch)',
    })).rejects.toThrow('simulated metadata rename failure')

    expect(fs.readdirSync(path.join(root, 'dsh-artifacts'))).toEqual([])
  })
})
