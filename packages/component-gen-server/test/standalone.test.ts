import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStandaloneServer, type StandaloneServer } from '../src/standalone.js'

let app: StandaloneServer | undefined
let root: string | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
  if (root) {
    rmSync(root, { recursive: true, force: true })
    root = undefined
  }
})

describe('standalone static server', () => {
  it('rejects malformed percent-encoded paths', async () => {
    root = mkdtempSync(join(tmpdir(), 'component-gen-standalone-'))
    const appDist = join(root, 'app')
    const historyDir = join(root, 'history')
    const artifactsDir = join(root, 'artifacts')
    mkdirSync(appDist)
    writeFileSync(join(appDist, 'index.html'), '')

    app = await createStandaloneServer({
      port: 0,
      appDist,
      historyDir,
      artifactsDir,
    })
    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('standalone server did not expose a TCP address')
    }

    const response = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
      get({ host: '127.0.0.1', port: address.port, path: '/%E0%A4%A' }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve({ statusCode: res.statusCode, body }))
      }).on('error', reject)
    })

    expect(response).toEqual({ statusCode: 400, body: 'bad request' })
  })
})
