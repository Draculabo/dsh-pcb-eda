import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStandaloneServer } from '../src/standalone.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('createStandaloneServer', () => {
  it('reports the actual port when the OS assigns an ephemeral port', async () => {
    const root = await mkdtemp(join(tmpdir(), 'component-gen-server-'))
    roots.push(root)

    const appDist = join(root, 'app')
    await mkdir(appDist)
    await writeFile(join(appDist, 'index.html'), '<!doctype html>')

    const app = await createStandaloneServer({
      port: 0,
      appDist,
      historyDir: join(root, 'history'),
      artifactsDir: join(root, 'artifacts'),
    })

    try {
      const address = app.server.address()
      expect(address).not.toBeNull()
      expect(typeof address).toBe('object')
      expect(app.port).toBe(typeof address === 'object' && address ? address.port : 0)
      expect(app.port).toBeGreaterThan(0)
    } finally {
      await app.close()
    }
  })
})
