import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { HuaqiuArtifactService } from '../src/service.js'

describe('artifact content integrity', () => {
  let root: string
  let service: HuaqiuArtifactService

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-artifacts-integrity-'))
    service = new HuaqiuArtifactService({ baseDir: root })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('rejects content whose byte length no longer matches metadata', async () => {
    const artifact = await service.create({
      type: 'zip',
      filename: 'bundle.zip',
      content: new Uint8Array([1, 2, 3, 4]),
    })
    const contentPath = path.join(root, 'dsh-artifacts', artifact.id, 'content')
    fs.writeFileSync(contentPath, new Uint8Array([1, 2, 3]))

    expect({
      meta: await service.get(artifact.id),
      content: await service.readContent(artifact.id),
    }).toEqual({
      meta: expect.objectContaining({ id: artifact.id, size: 4 }),
      content: null,
    })
  })
})
