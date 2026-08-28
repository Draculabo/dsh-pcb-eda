import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { InMemoryHuaqiuAuthService } from '../src/service.js'
import { AUTH_ROUTE_PREFIX, createAuthHandler } from '../src/routes.js'

describe('auth webServer routes (browser→node transport)', () => {
  let server: http.Server
  let base: string
  let svc: InMemoryHuaqiuAuthService

  beforeEach(async () => {
    svc = new InMemoryHuaqiuAuthService()
    server = http.createServer(createAuthHandler(svc))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function post(p: string, body?: unknown): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        base + p,
        { method: 'POST', headers: { 'content-type': 'application/json' } },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }))
        },
      )
      req.on('error', reject)
      if (body !== undefined) req.write(JSON.stringify(body))
      req.end()
    })
  }

  async function get(p: string): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      const req = http.get(base + p, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }))
      })
      req.on('error', reject)
    })
  }

  it('accepts a session push and exposes it to the node auth capability (group A)', async () => {
    const res = await post(`${AUTH_ROUTE_PREFIX}/session`, { token: 'tok-9', userId: 'u9', nickname: 'Nine' })
    expect(res.status).toBe(200)
    expect(svc.auth.isAuthenticated()).toBe(true)
    expect(await svc.auth.getAccessToken()).toBe('tok-9')
    expect(await svc.auth.getUserInfo()).toEqual({ id: 'u9', token: 'tok-9', nickname: 'Nine' })
  })

  it('GET /session reports the current node auth state', async () => {
    const before = JSON.parse((await get(`${AUTH_ROUTE_PREFIX}/session`)).text)
    expect(before.authenticated).toBe(false)
    await post(`${AUTH_ROUTE_PREFIX}/session`, { token: 't', userId: 'u' })
    const after = JSON.parse((await get(`${AUTH_ROUTE_PREFIX}/session`)).text)
    expect(after.authenticated).toBe(true)
    expect(after.user.token).toBe('t')
  })

  it('logout invalidates the node cache (group C)', async () => {
    await post(`${AUTH_ROUTE_PREFIX}/session`, { token: 't', userId: 'u' })
    const res = await post(`${AUTH_ROUTE_PREFIX}/logout`)
    expect(res.status).toBe(200)
    expect(svc.auth.isAuthenticated()).toBe(false)
    expect(await svc.auth.getAccessToken()).toBeNull()
  })

  it('rejects a session push without a token or userId', async () => {
    expect((await post(`${AUTH_ROUTE_PREFIX}/session`, { token: '' })).status).toBe(400)
    expect((await post(`${AUTH_ROUTE_PREFIX}/session`, { userId: 'u' })).status).toBe(400)
    expect(svc.auth.isAuthenticated()).toBe(false)
  })

  it('404s unknown paths', async () => {
    expect((await get(`${AUTH_ROUTE_PREFIX}/nope`)).status).toBe(404)
    expect((await post(`${AUTH_ROUTE_PREFIX}/nope`, {})).status).toBe(404)
  })
})
