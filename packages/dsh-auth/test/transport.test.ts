import { describe, expect, it, vi } from 'vitest'
import { createWebServerAuthTransport } from '../src/client/transport.js'

describe('createWebServerAuthTransport', () => {
  it('normalizes trailing slashes in the route base', async () => {
    const doFetch = vi.fn(async () => ({ ok: true, status: 204 }) as Response)
    const transport = createWebServerAuthTransport('/api/v1/huaqiu/auth/', doFetch as typeof fetch)

    await transport.pushSession({ id: 'u1', token: 'token-1' })
    await transport.pushLogout()

    expect(doFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/huaqiu/auth/session',
      '/api/v1/huaqiu/auth/logout',
    ])
  })
})
