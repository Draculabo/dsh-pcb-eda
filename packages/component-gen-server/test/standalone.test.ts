import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStandaloneServer, type StandaloneServer } from '../src/standalone.js'

const servers: StandaloneServer[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('standalone static files', () => {
  it('keeps resolved files inside the configured app root', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'component-gen-static-'))
    tempDirs.push(baseDir)

    const appDist = join(baseDir, 'app')
    const sibling = join(baseDir, 'app-private')
    mkdirSync(appDist)
    mkdirSync(sibling)
    writeFileSync(join(appDist, 'index.html'), 'app index')
    writeFileSync(join(sibling, 'secret.txt'), 'secret')

    const app = await createStandaloneServer({
      port: 0,
      appDist,
      historyDir: join(baseDir, 'history'),
      artifactsDir: join(baseDir, 'artifacts'),
    })
    servers.push(app)

    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('standalone server did not bind a TCP port')
    }

    expect(await get(address.port, '/index.html')).toEqual({
      status: 200,
      body: 'app index',
    })
    expect(await get(address.port, '/%2e%2e/app-private/secret.txt')).toEqual({
      status: 403,
      body: 'forbidden',
    })
  })
})
