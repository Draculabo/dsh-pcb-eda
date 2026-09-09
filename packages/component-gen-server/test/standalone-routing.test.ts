import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStandaloneServer, type StandaloneServer } from '../src/standalone.js'

const roots: string[] = []
const servers: StandaloneServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

describe('standalone routing', () => {
  it('serves SPA paths that only share text with API prefixes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'component-gen-standalone-'))
    roots.push(root)
    const appDist = join(root, 'app')
    mkdirSync(appDist)
    writeFileSync(join(appDist, 'index.html'), '<main>component generator</main>')

    const app = await createStandaloneServer({
      port: 0,
      appDist,
      historyDir: join(root, 'history'),
      artifactsDir: join(root, 'artifacts'),
    })
    servers.push(app)

    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('standalone server did not expose a TCP address')
    }

    const paths = [
      '/api/v1/huaqiu/authentic',
      '/api/v1/huaqiu/artifacts-preview',
      '/api/v1/huaqiu/component-generation',
    ]
    const responses = await Promise.all(paths.map(async (path) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`)
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: await response.text(),
      }
    }))

    expect(responses).toEqual(paths.map(() => ({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<main>component generator</main>',
    })))
  })
})
