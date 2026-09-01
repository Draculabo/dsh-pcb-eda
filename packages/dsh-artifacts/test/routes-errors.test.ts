import { afterEach, describe, expect, it } from 'vitest'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { HuaqiuArtifacts } from '../src/service.js'
import { ARTIFACTS_ROUTE_PREFIX, createArtifactsHandler } from '../src/routes.js'

describe('artifact route errors', () => {
  let server: http.Server | undefined

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve())
      })
      server = undefined
    }
  })

  it('does not expose internal service errors to clients', async () => {
    const service = {
      get: async () => {
        throw new Error('/private/storage/artifacts/meta.json')
      },
    } as unknown as HuaqiuArtifacts

    server = http.createServer(createArtifactsHandler(service))
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const response = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const request = http.get(`${base}${ARTIFACTS_ROUTE_PREFIX}/art_deadbeef`, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        }))
      })
      request.on('error', reject)
    })

    expect(response).toEqual({
      status: 500,
      body: { error: 'internal error resolving artifact' },
    })
  })
})
