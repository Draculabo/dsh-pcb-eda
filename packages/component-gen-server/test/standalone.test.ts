import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createStandaloneServer } from '../src/standalone.js'

describe('standalone static server', () => {
  it('rejects malformed percent-encoded paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'component-gen-standalone-'))
    const appDist = join(root, 'app')
    mkdirSync(appDist)
    writeFileSync(join(appDist, 'index.html'), '<!doctype html><title>component gen</title>')

    const app = await createStandaloneServer({
      port: 0,
      host: '127.0.0.1',
      appDist,
      historyDir: join(root, 'history'),
      artifactsDir: join(root, 'artifacts'),
    })

    try {
      const address = app.server.address()
      if (!address || typeof address === 'string') {
        throw new Error('standalone server did not expose a TCP address')
      }

      const response = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        const req = request({
          host: '127.0.0.1',
          port: address.port,
          path: '/%E0%A4%A',
          method: 'GET',
        }, (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
          })
          res.on('end', () => {
            resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
          })
        })
        req.on('error', reject)
        req.end()
      })

      expect(response).toEqual({ status: 400, body: 'bad request' })
    } finally {
      await app.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
