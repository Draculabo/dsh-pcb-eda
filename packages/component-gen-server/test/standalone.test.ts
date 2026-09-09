import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createStandaloneServer } from '../src/standalone.js'

describe('standalone static routes', () => {
  it('rejects malformed percent-encoded URLs without terminating the server', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hq-component-gen-standalone-'))
    const app = await createStandaloneServer({
      port: 0,
      appDist: root,
      historyDir: join(root, 'history'),
      artifactsDir: join(root, 'artifacts'),
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
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          res.on('end', () => resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          }))
        })
        req.on('error', reject)
        req.end()
      })

      expect(response).toEqual({
        status: 400,
        body: 'bad request',
      })
    } finally {
      await app.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
