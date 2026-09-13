import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createStandaloneServer } from '../src/standalone.js'

describe('standalone static server', () => {
  it('returns 400 for malformed URL encoding', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-component-standalone-'))
    const appDist = join(dir, 'dist')
    mkdirSync(appDist)
    writeFileSync(join(appDist, 'index.html'), '<!doctype html><title>component gen</title>')

    const app = await createStandaloneServer({
      port: 0,
      appDist,
      historyDir: join(dir, 'history'),
      artifactsDir: join(dir, 'artifacts'),
    })

    try {
      const address = app.server.address() as AddressInfo
      const response = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        const req = request({
          host: '127.0.0.1',
          port: address.port,
          path: '/%E0%A4%A',
        }, (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          }))
        })
        req.on('error', reject)
        req.end()
      })

      expect(response).toEqual({ status: 400, body: 'bad request' })
    } finally {
      await app.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
