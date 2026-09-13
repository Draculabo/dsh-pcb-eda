import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStandaloneServer, type StandaloneServer } from '../src/standalone.js'

describe('standalone static server', () => {
  let app: StandaloneServer | undefined
  let tempDir: string | undefined

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  it('returns 404 for missing assets while preserving SPA fallback', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'component-gen-static-'))
    const appDist = join(tempDir, 'dist')
    mkdirSync(appDist, { recursive: true })
    writeFileSync(join(appDist, 'index.html'), '<main>app shell</main>')

    app = await createStandaloneServer({
      port: 0,
      appDist,
      historyDir: join(tempDir, 'history'),
      artifactsDir: join(tempDir, 'artifacts'),
    })

    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected standalone server to listen on a TCP port')
    }

    const baseUrl = `http://127.0.0.1:${address.port}`
    const [routeResponse, assetResponse] = await Promise.all([
      fetch(`${baseUrl}/footprint`),
      fetch(`${baseUrl}/assets/missing.js`),
    ])

    expect({
      route: { status: routeResponse.status, body: await routeResponse.text() },
      asset: { status: assetResponse.status, body: await assetResponse.text() },
    }).toEqual({
      route: { status: 200, body: '<main>app shell</main>' },
      asset: { status: 404, body: 'not found' },
    })
  })
})
