import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { InMemoryHuaqiuAuthService } from '../src/service.js'
import { AUTH_ROUTE_PREFIX, createAuthHandler } from '../src/routes.js'

describe('auth route path matching', () => {
  let server: http.Server
  let base: string

  beforeEach(async () => {
    server = http.createServer(createAuthHandler(new InMemoryHuaqiuAuthService()))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('rejects trailing slashes instead of normalizing auth routes', async () => {
    const request = (path: string, method: 'GET' | 'POST') => new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const req = http.request(base + path, { method }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        }))
      })
      req.on('error', reject)
      req.end()
    })

    expect(await Promise.all([
      request(`${AUTH_ROUTE_PREFIX}/session/`, 'GET'),
      request(`${AUTH_ROUTE_PREFIX}/logout/`, 'POST'),
    ])).toEqual([
      { status: 404, body: { error: 'not found' } },
      { status: 404, body: { error: 'not found' } },
    ])
  })
})
