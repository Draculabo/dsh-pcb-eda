// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createWebServerAuthTransport } from '../src/client/transport.js'

describe('createWebServerAuthTransport', () => {
  it('fetchHostMode returns true when the node config route reports host mode', async () => {
    const doFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ hostMode: true }),
    })) as unknown as typeof fetch
    const t = createWebServerAuthTransport('/api/v1/huaqiu/auth', doFetch)
    expect(await t.fetchHostMode()).toBe(true)
    expect(doFetch).toHaveBeenCalledWith('/api/v1/huaqiu/auth/config', expect.objectContaining({ method: 'GET' }))
  })

  it('fetchHostMode returns false for standalone mode', async () => {
    const doFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ hostMode: false }),
    })) as unknown as typeof fetch
    expect(await createWebServerAuthTransport('/api/v1/huaqiu/auth', doFetch).fetchHostMode()).toBe(false)
  })

  it('fetchHostMode falls back to false (standalone) when the route is unreachable', async () => {
    const doFetch = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await createWebServerAuthTransport('/api/v1/huaqiu/auth', doFetch).fetchHostMode()).toBe(false)
  })
})
