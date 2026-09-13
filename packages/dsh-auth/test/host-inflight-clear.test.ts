import { describe, expect, it, vi } from 'vitest'
import { HostSessionResolver } from '../src/host.js'

vi.mock('@huaqiu/dsh-plugin-log', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('HostSessionResolver in-flight invalidation', () => {
  it('does not restore a cleared session from an older request', async () => {
    let finishFirst: ((value: unknown) => void) | undefined
    const fetchImpl = vi.fn()
    fetchImpl.mockImplementationOnce(() => new Promise((resolve) => {
      finishFirst = resolve
    }))
    fetchImpl.mockImplementationOnce(async () => {
      throw new Error('host unavailable')
    })

    const resolver = new HostSessionResolver(
      'http://hq',
      '/api/v1/auth/token',
      300_000,
      fetchImpl as unknown as typeof fetch,
    )

    const pending = resolver.resolve()
    await vi.waitFor(() => expect(finishFirst).toBeTypeOf('function'))

    resolver.clear()
    finishFirst!({
      ok: true,
      status: 200,
      json: async () => ({ token: 'stale-token', userId: 'stale-user' }),
    })

    expect(await pending).toBeNull()
    expect(await resolver.resolve()).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
