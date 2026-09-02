import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { HuaqiuArtifactService } from '../src/service.js'

describe('HuaqiuArtifactService deleteAll', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('leaves non-artifact directories untouched', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-artifacts-delete-all-'))
    roots.push(root)
    const service = new HuaqiuArtifactService({ baseDir: root })
    const artifact = await service.create({
      type: 'zip',
      filename: 'board.zip',
      content: 'artifact',
    })
    const foreignDir = path.join(root, 'dsh-artifacts', 'recovery')
    fs.mkdirSync(foreignDir)
    fs.writeFileSync(path.join(foreignDir, 'keep.txt'), 'keep')

    expect(await service.deleteAll()).toBe(1)
    expect(await service.get(artifact.id)).toBeNull()
    expect(fs.readdirSync(foreignDir)).toEqual(['keep.txt'])
  })
})
