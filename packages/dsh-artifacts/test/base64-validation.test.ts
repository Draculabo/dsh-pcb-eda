import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { HuaqiuArtifactService } from '../src/service.js'

describe('artifact base64 input validation', () => {
  let root: string
  let service: HuaqiuArtifactService

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-artifacts-base64-test-'))
    service = new HuaqiuArtifactService({ baseDir: root })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('rejects malformed base64 instead of silently storing decoded garbage', async () => {
    await expect(service.create({
      type: 'pcb',
      filename: 'board.kicad_pcb',
      content: 'aGVsbG8=%%%not-base64',
      contentEncoding: 'base64',
    })).rejects.toThrow('invalid base64 artifact content')

    expect(fs.existsSync(path.join(root, 'dsh-artifacts'))).toBe(false)
  })

  it('preserves valid base64 with whitespace and omitted padding', async () => {
    const artifact = await service.create({
      type: 'pcb',
      filename: 'board.kicad_pcb',
      content: 'aGVs\n bG8',
      contentEncoding: 'base64',
    })

    expect({
      artifact: { type: artifact.type, filename: artifact.filename, size: artifact.size },
      content: Buffer.from((await service.readContent(artifact.id))!).toString('utf8'),
    }).toEqual({
      artifact: { type: 'pcb', filename: 'board.kicad_pcb', size: 5 },
      content: 'hello',
    })
  })
})
