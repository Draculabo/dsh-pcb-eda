import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createStandaloneServer } from '../src/standalone.js'

describe('createStandaloneServer', () => {
  it('reports the assigned port when listening on an ephemeral port', async () => {
    const root = mkdtempSync(join(tmpdir(), 'component-gen-standalone-'))

    try {
      const app = await createStandaloneServer({
        port: 0,
        host: '127.0.0.1',
        appDist: join(root, 'app'),
        historyDir: join(root, 'history'),
        artifactsDir: join(root, 'artifacts'),
      })

      try {
        const address = app.server.address()
        expect(typeof address === 'object' && address ? address.port : null).toBe(app.port)
        expect(app.port).toBeGreaterThan(0)
      } finally {
        await app.close()
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
